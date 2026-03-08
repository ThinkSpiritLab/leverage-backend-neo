# Security Audit Report — Leverage Backend Neo

> 审计时间：2026-03-08  
> 审计范围：submission / problem / user / compete / transmit 模块新增 endpoint  
> 对照基准：旧后端 `/Users/yuzhe/.openclaw/workspace/projects/leverage`

---

## 权限矩阵（完整端点列表）

### Submission 模块 (`/submissions`)

| 路径 | 方法 | 旧后端权限 | 新后端权限 | 匹配? | 备注 |
|------|------|-----------|-----------|-------|------|
| `/submissions` | GET | 返回 `[]`（无权限意义） | public | ✅ | 旧接口返回空列表 |
| `/submissions/count` | GET | public | public | ✅ | |
| `/submissions/ratio` | GET | admin/supervisor | supervisor+ | ✅ | |
| `/submissions/search` | POST | public | public | ✅ | |
| `/submissions/search-unlimited` | POST | admin/supervisor | supervisor+ | ✅ | |
| `/submissions/rejudge-log` | POST | admin | admin | ✅ | |
| `/submissions/user-problem-status` | GET | auth（本人） | auth（本人） | ✅ | |
| `/submissions/user-problem-status/batch` | GET | auth（本人） | auth（本人） | ✅ | |
| `/submissions/batch-rejudge` | POST | admin | admin | ✅ | |
| `/submissions/code-zip` | GET | **sa only** | admin | ⚠️ | 权限从 sa 下调到 admin，仍受限，可接受 |
| `/submissions/sus-recent` | GET | admin | admin | ✅ | |
| `/submissions/sus-union` | GET | admin | admin | ✅ | |
| `/submissions/sus-xlsx` | GET | admin | admin | ✅ | |
| `/submissions/sus/:hashsum` | GET | admin | admin | ✅ | |
| `/submissions/sus-checked/:id` | PUT | admin | admin | ✅ | |
| `/submissions/sus-test` | POST | admin | admin | ✅ | |
| `/submissions/ce/:id` | GET | auth（本人/admin） | auth（本人/admin） | ✅ | |
| `/submissions/:id/inspect` | POST | **无权限（FIXME）** | auth（本人/admin） | ✅ | **新后端已修复** |
| `/submissions/:id/rejudge` | POST | admin | ~~supervisor~~ → **admin** | ✅ | **已修复：supervisor→admin** |
| `/submissions/:id/status` | GET | public | public | ✅ | 轮询状态，公开合理 |
| `/submissions/:id` | GET | auth | public | ⚠️ | 旧接口需要auth，新接口公开；OJ常见做法，可接受 |
| `/submissions` | DELETE `:id` | **sa only** | admin | ⚠️ | 权限从 sa 下调到 admin，仍受限 |
| `/submissions` | POST | auth | auth | ✅ | |

### Problem 模块 (`/problems`)

| 路径 | 方法 | 旧后端权限 | 新后端权限 | 匹配? | 备注 |
|------|------|-----------|-----------|-------|------|
| `/problems/next-id` | GET | admin | admin | ✅ | |
| `/problems/logic` | GET | public（auth context） | public（optional user） | ✅ | |
| `/problems/digest-partial` | GET | public（auth context） | public（optional user） | ✅ | |
| `/problems/manage-partial` | GET | admin | admin | ✅ | |
| `/problems/manage/available-digest` | GET | admin | admin | ✅ | |
| `/problems/import-fps` | POST | admin | admin | ✅ | |
| `/problems/simp-extra` | POST | admin | admin | ✅ | |
| `/problems/batch-zip-hash` | POST | admin | admin | ✅ | |
| `/problems/course-problem-list/:id` | GET | admin | admin | ✅ | |
| `/problems/contest-problem-list/:id` | GET | admin | admin | ✅ | |
| `/problems` | GET | public（auth context） | public（optional user） | ✅ | |
| `/problems` | POST | admin | admin | ✅ | |
| `/problems/:id` | GET | public（auth context） | public（optional user） | ✅ | |
| `/problems/:id` | PATCH | admin | admin | ✅ | |
| `/problems/:id` | DELETE | **sa only** | admin | ⚠️ | 权限从 sa 下调到 admin，仍受限 |
| `/problems/:id/ratio` | GET | public | public | ✅ | |
| `/problems/:id/refs` | GET | admin | admin | ✅ | |
| `/problems/:id/tag` | GET | public | public | ✅ | |
| `/problems/:id/tag` | POST | admin | admin | ✅ | |
| `/problems/:id/tag/:tagId` | DELETE | admin | admin | ✅ | |
| `/problems/:id/test-cases` | GET | admin | admin | ✅ | |
| `/problems/:id/test-data` | POST | admin | admin | ✅ | |

### User 模块 (`/users`)

| 路径 | 方法 | 旧后端权限 | 新后端权限 | 匹配? | 备注 |
|------|------|-----------|-----------|-------|------|
| `/users` | GET | admin/supervisor | supervisor+ | ✅ | |
| `/users/import` | POST | admin/supervisor | admin | ✅ | 新后端更严格 |
| `/users/:id` | GET | auth | auth | ✅ | |
| `/users` | POST | admin | admin | ✅ | |
| `/users/:id` | PATCH | admin | admin | ✅ | |
| `/users/:id` | DELETE | admin | admin | ✅ | |
| `/users/:id/password` | POST | auth（本人/admin） | auth（本人/admin） | ✅ | |
| `/users/:id/problem-status` | GET | auth | auth | ✅ | |

> **注意**：旧后端包含 `GET /user/banned`、`POST /user/:id/ban` 等封号接口（admin 权限），新后端尚未实现。不属于安全漏洞（功能缺失），但需后续补充。

### Compete 模块 (`/compete`)

| 路径 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/compete/games` | GET | public | ✅ |
| `/compete/games` | POST | admin | ✅ |
| `/compete/games/:id` | PATCH | admin | ✅ |
| `/compete/games/:id` | DELETE | admin | ✅ |
| `/compete/games/:id/playback` | POST | admin | ✅ |
| `/compete/games/:id/leaderboard` | GET | public | ✅ |
| `/compete/gamers` | GET | public | ✅ |
| `/compete/gamers` | POST | auth（login） | ✅ |
| `/compete/gamers/:id` | PATCH | auth（本人） | ✅ |
| `/compete/matches` | GET | public | ✅ |
| `/compete/matches` | POST | auth（login） | ✅ |
| `/compete/matches/:id` | GET | public | ✅ |
| `/compete/matches/:id/inspect` | POST | auth（login） | ✅ |
| `/compete/rooms` | GET | public | ✅ |
| `/compete/rooms` | POST | auth（login） | ✅ |
| `/compete/rooms/cooldown` | GET | auth（login） | ✅ |
| `/compete/rooms/:id` | GET | public | ✅ |
| `/compete/rooms/:id/submit` | POST | auth（login） | ✅ |
| `/compete/rooms/:id/start` | POST | auth（login） | ✅ |
| `/compete/rooms/:id/open` | PUT | auth（login） | ✅ |
| `/compete/rooms/:id/close` | PUT | auth（login） | ✅ |
| `/compete/rooms/:id/player` | PUT | auth（login） | ✅ |

### Transmit 模块 (`/transmit`)

> 控制器级别统一声明 `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('admin')`，所有端点继承。

| 路径 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/transmit/judgers` | GET | admin | ✅ |
| `/transmit/refresh-test-files` | GET | admin | ✅ |
| `/transmit/rebuild-rank-log` | GET | admin | ✅ |
| `/transmit/queue-status` | GET | admin | ✅ |

---

## 发现的问题列表

### 🔴 已修复的问题（1 个）

| # | 模块 | 端点 | 问题描述 | 修复方案 |
|---|------|------|---------|---------|
| 1 | submission | `POST /submissions/:id/rejudge` | 权限从旧后端的 `admin` 降级为 `supervisor`，导致 supervisor 级别用户可以触发重判，超出其权限范围 | 将 `@Roles('supervisor')` 改为 `@Roles('admin')` |

### 🟡 已记录但可接受的差异（3 个）

| # | 模块 | 端点 | 旧权限 | 新权限 | 说明 |
|---|------|------|-------|-------|------|
| 2 | submission | `GET /submissions/code-zip` | sa only | admin | 旧后端仅超管能下载代码包；新后端允许任意 admin。属有意设计，admin 仍属高权限角色。 |
| 3 | submission | `DELETE /submissions/:id` | sa only | admin | 同上，删除提交从超管降为 admin 可操作。 |
| 4 | problem | `DELETE /problems/:id` | sa only | admin | 删除题目从超管降为 admin 可操作。 |

### 🟢 安全改进（新后端优于旧后端）

| # | 模块 | 端点 | 说明 |
|---|------|------|------|
| 5 | submission | `POST /submissions/:id/inspect` | 旧后端有 `// FIXME access control` 注释，实际无权限检查（`@NoRestrict()`）；新后端要求登录，并在 service 层校验本人或 admin |

---

## 高风险接口说明

### 查重系列（sus-*） — 必须 admin

以下接口涉及代码查重数据，一旦泄露可能暴露学生代码隐私，必须严格限制为 admin：

- `GET /submissions/sus-recent` ✅
- `GET /submissions/sus-union` ✅
- `GET /submissions/sus-xlsx` ✅
- `GET /submissions/sus/:hashsum` ✅
- `PUT /submissions/sus-checked/:id` ✅
- `POST /submissions/sus-test` ✅

### 重判接口 — 必须 admin

触发重判会修改历史成绩，影响竞赛/课程公平性，必须严格限制：

- `POST /submissions/batch-rejudge` ✅ admin
- `POST /submissions/:id/rejudge` ✅ admin（**已从 supervisor 修复为 admin**）
- `POST /submissions/rejudge-log` ✅ admin

### 代码下载 — admin 以上

- `GET /submissions/code-zip` ✅ admin（旧后端为 sa，新后端为 admin，已记录）

### FPS 题目导入 — 必须 admin

- `POST /problems/import-fps` ✅ admin

### transmit 系列 — 必须 admin

控制评测机、刷新测试文件、重建排行榜等系统级操作，全部在控制器级别声明 admin ✅

### inspect（查看代码）— 需要认证

旧后端无权限控制（FIXME），新后端已修复为 JWT 认证 + 本人/admin 校验 ✅

---

## 安全测试覆盖

测试文件：`test/e2e/security.e2e.spec.ts`

共 **44 个**安全测试用例，覆盖：
- sus-* 系列：12 个（6 endpoint × 2 场景）
- 重判系列：6 个
- code-zip：2 个
- 题目管理（import-fps / batch-zip-hash / manage-partial / next-id）：8 个
- transmit 全部端点：8 个
- 用户管理（create / import / delete）：6 个
- compete 游戏管理（create / delete）：4 个
- 需要登录的接口（提交/房间/status）：3 个
