# API Reference

For current Botzone wire formats, runtime language IDs, callback identity and
private Bot read boundaries, see [Judge compatibility](JUDGE_COMPATIBILITY.md).

Interactive documentation is available at `/api/docs` (Swagger UI) when the server is running. This document provides a structured overview of all routes, auth requirements, and conventions.

## Authentication

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

Obtain tokens via `POST /auth/login`. Refresh via `POST /auth/refresh`.

## Response Format

```jsonc
// Success
{ "data": { ... } }        // or top-level object/array depending on endpoint

// Error (NestJS default exception format)
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

## Permission Levels

Permissions are hierarchical. A higher role also satisfies lower-privilege requirements.

| Role | Weight | Description |
|------|--------|-------------|
| `sa` | 0 | Super admin — full access |
| `admin` | 1 | Admin — manage users, problems, contests |
| `supervisor` | 2 | Can view sensitive data (submissions, balloons) |
| `user` | 3 | Authenticated regular user |
| `contest-user` | 4 | Contest-scoped user |
| `guest` | 5 | Unauthenticated |

The column **Auth** in the tables below uses:
- `—` → public (no token required)
- `user` → any authenticated user
- `supervisor` → supervisor or above
- `admin` → admin or above
- `sa` → super admin only

---

## Routes

### Auth — `/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | — | Login with username/password; returns `accessToken` + `refreshToken` |
| POST | `/auth/login/contest` | — | Login as a contest user; returns scoped `accessToken` |
| POST | `/auth/refresh` | — | Exchange `refreshToken` for a new `accessToken` |
| POST | `/auth/logout` | — | Stateless logout (client discards token) |
| GET | `/auth/profile` | user | Return current user's JWT payload |
| POST | `/auth/api-keys` | user | Create a new API key (returns plaintext once) |
| GET | `/auth/api-keys` | user | List user's API keys (masked) |
| DELETE | `/auth/api-keys/:id` | user | Revoke an API key |

### Users — `/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | supervisor | Paginated user list with search |
| POST | `/users` | admin | Create a user |
| POST | `/users/import` | admin | Bulk import users |
| GET | `/users/:id` | user | User profile |
| PATCH | `/users/:id` | admin | Update user (role weight check enforced) |
| DELETE | `/users/:id` | admin | Delete user |
| POST | `/users/:id/password` | user | Change password (self or admin+) |
| GET | `/users/:id/problem-status` | user | Per-problem AC/attempt status (from Redis) |

### Problems — `/problems`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/problems` | — | Paginated problem list; non-admin filters out hidden problems |
| GET | `/problems/:id` | — | Problem detail (6 s Redis cache) |
| POST | `/problems` | admin | Create problem |
| PATCH | `/problems/:id` | admin | Update problem |
| DELETE | `/problems/:id` | admin | Delete problem |
| POST | `/problems/:id/test-data` | admin | Upload and replace the problem's test-data ZIP |

Test-data upload uses a multipart `file` field. The ZIP contains only flat,
consecutive UTF-8 pairs `1.in`/`1.out` through `N.in`/`N.out` (1–64 pairs).
Archive size is capped at 16 MiB; each decompressed file at 1 MiB and all
files together at 64 MiB. Unknown paths, unpaired files and malformed archives
are rejected. A successful upload stores the files in the backend's trusted
`TEST_CASES_PATH` volume and updates the problem's case count. Keep API and Worker
on the same test-data volume; do not replace data while a judge attempt is active.
The current production proxy retains its earlier body-size limit; raise it above
16 MiB plus multipart overhead and verify a real proxy upload before release.

### Submissions — `/submissions`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/submissions` | — | Paginated list; filter by `userId`, `problemId`, `status` |
| GET | `/submissions/:id` | — | Submission detail with judge result |
| POST | `/submissions` | user | Create submission (rate-limited per user) |
| GET | `/submissions/:id/status` | — | Fast status poll (from Redis) |
| POST | `/submissions/:id/rejudge` | supervisor | Re-enqueue submission for judging |

### Contests — `/contests`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/contests` | user | Paginated list; filter by status |
| POST | `/contests` | admin | Create contest |
| GET | `/contests/:id` | user | Contest detail with problem list |
| PATCH | `/contests/:id` | admin | Update contest |
| DELETE | `/contests/:id` | admin | Delete contest |
| POST | `/contests/:id/users` | user | Register self to contest |
| POST | `/contests/:id/users/import` | admin | Bulk import contest users (random passwords) |
| GET | `/contests/:id/ranking` | user | Real-time ranking (Redis Sorted Set) |
| GET | `/contests/:id/balloons` | supervisor | List undelivered balloon records |
| PATCH | `/contests/:id/balloons/:bid` | supervisor | Mark balloon as delivered |
| POST | `/contests/:id/submissions` | user | Submit code within contest context |
| GET | `/contests/:id/submissions` | user | List contest submissions |

### Courses — `/courses`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/courses` | user | Paginated course list |
| POST | `/courses` | admin | Create course |
| GET | `/courses/:id` | user | Course detail |
| PATCH | `/courses/:id` | admin | Update course |
| DELETE | `/courses/:id` | admin | Delete course |
| POST | `/courses/:id/students` | admin | Add students to course |
| DELETE | `/courses/:id/students/:userId` | admin | Remove student from course |
| GET | `/courses/:id/ranking` | user | Course leaderboard |
| GET | `/courses/:id/submissions` | user | Course submission list |
| GET | `/courses/:id/submissions/export` | user | Export submissions (exact / range / regex filter) |
| POST | `/courses/:id/submissions` | user | Submit code within course context |

### Compete (Bot Battle) — `/compete`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/compete/games` | — | List all games |
| GET | `/compete/games/:id/leaderboard` | — | Game win-rate leaderboard |
| POST | `/compete/games` | admin | Create game |
| PATCH | `/compete/games/:id` | admin | Update game |
| DELETE | `/compete/games/:id` | admin | Delete game |
| POST | `/compete/games/:id/playback` | admin | Upload game playback zip |
| GET | `/compete/gamers` | — | List all bot players |
| POST | `/compete/gamers` | user | Register a bot |
| PATCH | `/compete/gamers/:id` | user | Update own bot |
| POST | `/compete/matches` | user | Create a match |
| GET | `/compete/matches` | — | List matches |
| GET | `/compete/matches/:id` | — | Match detail |

### Media — `/media`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/media/upload` | user | Upload file (extension + MIME validation) |
| GET | `/media` | admin | List uploaded files |
| GET | `/media/:id` | — | Get file download URL |
| DELETE | `/media/:id` | admin | Delete file |


### Health & Observability

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Service health (DB + Redis) |
| GET | `/metrics` | — | Prometheus metrics |

---

## Common Error Codes

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Bad Request — validation failed |
| 401 | Unauthorized — missing or invalid token |
| 403 | Forbidden — insufficient role |
| 404 | Not Found — resource does not exist |
| 409 | Conflict — duplicate resource (e.g. username taken) |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error |

For full request/response schemas, refer to the Swagger UI at `/api/docs`.

---

## Additional Routes (Post-Refactor)

The following endpoints were added after the initial documentation was written. They supplement the routes listed above.

---

### Submissions — `/submissions` (Additional)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/submissions/count` | — | 返回提交总数（整数） |
| GET | `/submissions/ratio` | supervisor | 通过率统计（按状态分组）；query: `problemId`（必填），`contestId`，`courseId` |
| POST | `/submissions/search` | — | 分页搜索提交；body: `SearchSubmissionDto`；query: `page`，`contestId`，`courseId` |
| POST | `/submissions/search-unlimited` | supervisor | 管理员无限制搜索，无 userId/visibiliy 过滤；body: `SearchSubmissionDto` |
| POST | `/submissions/rejudge-log` | admin | 查询重判日志；body: `SearchSubmissionDto`；query: `page` |
| GET | `/submissions/user-problem-status` | user | 查询当前用户对单题的提交状态；query: `userId`，`problemId`，`contestId`，`courseId` |
| GET | `/submissions/user-problem-status/batch` | user | 批量查询当前用户对多题的提交状态；query: `userId`，`problemIds`（逗号分隔），`contestId`，`courseId` |
| POST | `/submissions/batch-rejudge` | admin | 批量重判；body: `RejudgeDto`；query: `count`（仅统计数量） |
| GET | `/submissions/code-zip` | admin | 下载代码 zip 包；query: `userId`，`contestId`，`courseId`，`problemId`，`take` |
| GET | `/submissions/sus-recent` | admin | 最近未处理的可疑提交列表（最多 12 条，按评分降序） |
| GET | `/submissions/sus-union` | admin | 按用户列表查重合并结果；query: `users`（逗号分隔的用户 ID） |
| GET | `/submissions/sus-xlsx` | admin | 导出查重结果 CSV；query: `contestId`，`courseId`，`problemId`，`userId`，`take` |
| GET | `/submissions/sus/:hashsum` | admin | 按 hashsum 查相同代码的提交列表 |
| PUT | `/submissions/sus-checked/:id` | admin | 标记/取消标记查重记录为已处理 |
| POST | `/submissions/sus-test` | admin | 对代码字符串计算查重指标；body: `{ code: string }` |
| GET | `/submissions/ce/:id` | user | 获取编译错误详情（只能查自己，管理员不限） |
| POST | `/submissions/:id/inspect` | user | 查看提交代码（只能查自己，管理员不限）；返回 `{ id, code }` |
| DELETE | `/submissions/:id` | admin | 删除提交 |

> **注意：** 以上路由中 `GET /submissions/sus-recent`、`sus-union`、`sus-xlsx`、`sus/:hashsum`、`sus-checked/:id`、`sus-test` 均需要 `admin+`；`ce/:id` 和 `:id/inspect` 需要登录，仅限本人或管理员查看。

---

### Problems — `/problems` (Additional)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/problems/next-id` | admin | 获取下一个可用 logicId；query: `prefix`（必填，如 `p`） |
| GET | `/problems/logic` | — | 按 prefix + logicId 查询题目；query: `prefix`，`logicId` |
| GET | `/problems/digest-partial` | — | 题目摘要列表（精简字段，用于选择器）；query: `page`，`tags`，`title`，`todo` |
| GET | `/problems/manage-partial` | admin | 管理员视角题目列表（含隐藏题目）；query: `page`，`tags`，`title` |
| GET | `/problems/manage/available-digest` | admin | 管理员可用题目摘要（未关闭）；query: `page` |
| POST | `/problems/import-fps` | admin | 从 FPS XML 格式导入题目；multipart/form-data，字段 `file`（xml）和 `params`（JSON 字符串） |
| POST | `/problems/simp-extra` | admin | 快速创建题目骨架；body: `SimpExtraDto`（`title`，`prefix`） |
| POST | `/problems/batch-zip-hash` | admin | 批量生成测试数据 zip hash；body: `ZipHashDto` |
| GET | `/problems/course-problem-list/:courseId` | admin | 获取课程的题目 ID 列表 |
| GET | `/problems/contest-problem-list/:contestId` | admin | 获取竞赛的题目 ID 列表 |
| GET | `/problems/:id/ratio` | — | 题目提交数/通过数统计 |
| GET | `/problems/:id/refs` | admin | 题目被引用情况（在哪些竞赛/课程中使用） |
| GET | `/problems/:id/tag` | — | 获取题目标签列表 |
| POST | `/problems/:id/tag` | admin | 给题目添加标签；body: `{ tagId: number }` |
| DELETE | `/problems/:id/tag/:tagId` | admin | 移除题目标签 |
| GET | `/problems/:id/test-cases` | admin | 获取测试用例文件列表（文件名） |

---

### Users — `/users` (Additional)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/:id/problem-status` | user | 用户做题状态（从 Redis 读）；query: `problemIds`（逗号分隔） |

> **注意：** 原有文档中的 `GET /users/:id/problem-status` 与此相同，已在原文档中列出。如需查询多题批量状态，请参考 `GET /submissions/user-problem-status/batch`。

---

### Compete (Bot Battle) — `/compete` (Additional)

以下为 Compete 模块在原文档基础上新增的 **Rooms** 子模块端点：

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/compete/rooms` | user | 创建对战房间；body: `CreateRoomDto` |
| GET | `/compete/rooms` | — | 列出所有开放中的房间 |
| GET | `/compete/rooms/cooldown` | user | 查询当前用户创建房间的冷却时间 |
| GET | `/compete/rooms/:id` | — | 获取房间详情 |
| POST | `/compete/rooms/:id/submit` | user | 在房间中提交 Bot；body: `SubmitGamerDto` |
| POST | `/compete/rooms/:id/start` | user | 开始对局（房主或 admin） |
| PUT | `/compete/rooms/:id/open` | user | 开放房间（允许其他人加入） |
| PUT | `/compete/rooms/:id/close` | user | 关闭房间（停止接受新加入） |
| PUT | `/compete/rooms/:id/player` | user | 设置房间位置的玩家；body: `ModifyPlayerDto` |

**Matches 子模块新增：**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/compete/matches/:id/inspect` | user | 查看对局代码详情（含 gamer 代码） |

---

### Transmit — `/transmit`

> 全新模块，所有端点需要 `admin+`。

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/transmit/judgers` | admin | 列出评测机（deprecated，返回静态数据） |
| GET | `/transmit/refresh-test-files` | admin | 手动触发从 OSS 刷新测试数据文件（未配置 OSS 时跳过） |
| GET | `/transmit/rebuild-rank-log` | admin | 手动重建竞赛/课程排行榜 Redis Sorted Set |
| GET | `/transmit/queue-status` | admin | 查询 BullMQ 评测队列状态 |

---

### Notifications — `/notifications`

> 原文档未收录，现补充完整。

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/notifications` | — | 通知列表；query: `page`，`perPage` |
| POST | `/notifications` | admin | 创建通知；body: `CreateNotificationDto` |
| GET | `/notifications/unread-count` | user | 获取当前用户未读通知数 |
| PATCH | `/notifications/:id/read` | user | 标记通知已读（204 No Content） |

---

### Tags — `/tags`

> 原文档未收录，现补充完整。

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tags` | — | 获取所有标签（树形结构） |
| POST | `/tags` | admin | 创建标签；body: `CreateTagDto` |
| PATCH | `/tags/:id` | admin | 更新标签；body: `UpdateTagDto` |
| DELETE | `/tags/:id` | admin | 删除标签（204 No Content） |

---

### Settings — `/settings`

> 原文档未收录，现补充完整。

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/settings/public` | — | 获取公开配置（站点名称等） |
| GET | `/settings` | admin | 获取所有配置 |
| POST | `/settings` | admin | 设置配置；body: `{ key: string, value: any }` |

---

### Statistics — `/statistics`

> 原文档未收录，现补充完整。

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/statistics/overview` | admin | 获取系统概览（用户数、提交数等） |
| GET | `/statistics/problem/:id/ratio` | — | 获取题目通过率 |
| GET | `/statistics/user/:id/activity` | — | 获取用户活跃度 |

---

### Logs — `/logs`

> 原文档未收录，现补充完整。所有端点需要 `admin+`。

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/logs` | admin | 获取操作日志列表；query: `userId`，`page`，`perPage`（上限 100） |

---

### Colleges & Professions — `/colleges`, `/professions`

> 原文档未收录，现补充完整（学院/专业管理）。

**学院：**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/colleges` | — | 获取所有学院列表 |
| POST | `/colleges` | admin | 创建学院；body: `CreateCollegeDto` |
| PATCH | `/colleges/:id` | admin | 更新学院；body: `UpdateCollegeDto` |
| DELETE | `/colleges/:id` | admin | 删除学院 |

**专业：**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/professions` | — | 获取所有专业列表；query: `college`（学院名，可选过滤） |
| POST | `/professions` | admin | 创建专业；body: `CreateProfessionDto` |
| PATCH | `/professions/:id` | admin | 更新专业；body: `UpdateProfessionDto` |
| DELETE | `/professions/:id` | admin | 删除专业 |

---

### AI Context — `/ai`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/ai` | — | Plain-text AI context document (judge/bot protocol, API quickref, MCP tools) |
| GET | `/api/ai` | — | Alias (proxy-friendly) |

This endpoint is designed to be pasted into any AI agent's context. It includes the complete judge/bot protocol, REST API reference, and MCP tool list with a Claude Desktop config template.
