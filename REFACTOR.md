# Leverage Backend Neo — 重构指南

## 背景

本项目是对 [ThinkSpiritLab/leverage](https://github.com/ThinkSpiritLab/leverage) 后端的完整重构。
原项目是一个 Online Judge 平台，已运行多年，存在大量技术债务。

原始代码路径（参考用）：`/Users/yuzhe/.openclaw/workspace/projects/leverage/src/`
原始文档路径：`/Users/yuzhe/.openclaw/workspace/projects/leverage/docs/`

## 技术栈决策

| 项目 | 原版 | 新版 |
|------|------|------|
| 框架 | NestJS (旧版) | NestJS latest |
| ORM | TypeORM (旧版，有废弃 API) | TypeORM latest |
| 数据库 | MariaDB (假设 10.6+) | 同，**不改 schema** |
| 认证 | Session Cookie | **JWT (access + refresh token)** |
| 队列 | 自研 Queue<T>（基于 Redis List） | **BullMQ**（Redis Stream，成熟库） |
| 日志 | console.log | **nestjs-pino**（结构化 JSON） |
| 监控 | 无 | **Prometheus endpoint**（`@willsoto/nestjs-prometheus`） |
| 运行模式 | PM2 cluster（多进程，有 bug） | **单进程，无状态**（水平扩展靠 nginx） |
| 排行榜 | 全表扫描，每 15 分钟重建 | **Redis Sorted Set**（ZADD/ZRANK，实时更新） |
| 部署 | 裸机 PM2 | **Docker + docker-compose** |

## 核心原则

1. **不改数据库 Schema**（除非特别必要，需提出并等待确认）
2. **功能对等**：所有原有功能必须保留（可重命名路由，不影响实际功能）
3. **pass 测试**：核心链路单元测试覆盖率 ≥ 80%，其他模块 ≥ 60%
4. **大刀阔斧**：去除所有代码坏味道，不保留原有屎山写法
5. **JWT 替换 Session**：ContestUser 认证也用 JWT，payload 含 contestId，Guard 内验设备/IP

## 系统架构

```
[前端 Nuxt 4] ←→ [后端 NestJS] ←→ [MariaDB]
                      ↕                 ↕
                   [Redis]         [BullMQ Queue]
                      ↕
              [heng-controller] ←→ [评测机 × N]
```

### 评测链路（核心，必须正确实现）

```
用户 POST /submissions
  → 写 DB（status: PENDING）
  → BullMQ: 推入 judge-tx 队列
    → Worker: HMAC 签名 → HTTP POST heng-controller /c/v1/judges
      → heng-controller 回调 POST /heng/update/:submissionId/:judgeId（中间状态）
      → heng-controller 回调 POST /heng/finish/:submissionId/:judgeId（最终结果）
        → 更新 DB（Submission + SubmissionMisc + User + Problem 统计）
        → Redis Sorted Set 实时更新排行榜
        → 更新 UserProblemStatus 缓存
```

### 防重放机制（保留）
- 每次提交生成 `judgeId`（32 字节随机 hex）
- Redis SADD `judge-ids:{submissionId}` → `judgeId`
- 回调时验证 judgeId 在 Set 中，否则忽略（防止旧评测结果覆盖重评）

## 模块清单

按优先级顺序实现：

### 核心模块（必须）
1. **auth** — JWT 认证，login/logout/refresh，PBKDF2-SHA256+salt 密码哈希
2. **submission** — 提交代码，频率限制（Redis），资源倍增（Java/Python 等）
3. **heng** — 与 heng-controller 通信，HMAC 签名，BullMQ judge-tx/judge-rx
4. **receive** — 接收评测结果，更新 DB，更新排行榜 Sorted Set
5. **problem** — 题目 CRUD，测试数据上传（校验必须是 zip），缓存

### 业务模块（必须）
6. **user** — 用户管理，权限体系（数字权重：sa=0 < admin=1 < supervisor=2 < user=3 < guest=5）
7. **contest** — 竞赛管理，ContestUser（支持独立密码、设备绑定、IP 绑定）
8. **course** — 课程管理，CourseUser，按条件导出提交
9. **rank** — 排行榜，Redis Sorted Set，排名日志

### 辅助模块
10. **setting** — 系统配置，支持 string/number 类型，12s 缓存
11. **tag** — 题目标签
12. **log** — 操作日志
13. **notification** — 通知
14. **media** — 媒体文件上传
15. **profession-college** — 专业/学院，批量导入用户时校验
16. **statistics** — 统计
17. **suspicion** — 查重（代码哈希 + 评分，修好 sus-xlsx 接口）
18. **init** — 初始化（通过环境变量 `SKIP_INIT=true` 跳过，不要硬编码用户名）

### 基础设施
- **redis** — RedisService + CacheService（通用缓存封装）
- **database** — TypeORM 配置，MariaDB
- **queue** — BullMQ 配置（替代自研 Queue<T>）
- **logger** — nestjs-pino 配置
- **metrics** — Prometheus endpoint

## 坏味道清单（必须修复）

来自代码审查 `docs/TODO.md`：

### 高优先级（已在 fix/issues 分支修复，重构时保持修复状态）
- ✅ `manager.increment()` 缺少 await → 数据不一致
- ✅ main.ts 硬编码开发者用户名 → 改用 `SKIP_INIT` env
- ✅ SSL 证书验证 `rejectUnauthorized: false` → 默认开启，`HENG_ALLOW_INSECURE_TLS` 控制
- ✅ 密码无 salt → PBKDF2-SHA256 + random salt
- ✅ pendingSet 内存变量多进程不安全 → Redis Set（重构用 Sorted Set 完全替代）
- ✅ filter-sheet rangeMatch 匹配整个文本而非单行

### 必须在重构中解决
- 排行榜全表扫描卡进程 → Redis Sorted Set 实时维护
- 分页 offset 硬编码 bug → 正确的 page × perpage
- getHashes `for...in` 遍历数组 → `for...of`
- 魔法数字全部提取为 named constants
- 零测试覆盖 → 写测试

## 环境变量规范

```env
# 数据库
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=leverage
DB_USERNAME=leverage
DB_PASSWORD=secret

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Heng Controller
HENG_BASE_URL=http://localhost:3001
HENG_AK=your-ak
HENG_SK=your-sk
HENG_ALLOW_INSECURE_TLS=false

# App
PORT=3000
SKIP_INIT=false
MAX_SUBMISSION_PER_MINUTE=10
```

## API 规范

- RESTful，路径小写 kebab-case
- 统一响应格式：
  ```json
  { "data": ..., "message": "ok" }
  ```
- 错误格式：
  ```json
  { "statusCode": 400, "message": "具体错误", "error": "Bad Request" }
  ```
- Swagger 文档：`/api/docs`（`@nestjs/swagger`）
- 所有 Controller 用 `@ApiTags` + `@ApiOperation` 注释

## Commit 规范（重要）

**粒度要细，越碎越好**，每完成一个小单元就 commit，不要攒着。

格式：`type(scope): 描述`

类型：
- `feat` — 新功能
- `fix` — bug 修复
- `refactor` — 重构（不改功能）
- `test` — 测试
- `chore` — 配置/依赖/工具
- `docs` — 文档

**粒度示例（正确做法）：**
```
feat(auth): 添加 JWT access token 生成
feat(auth): 添加 JWT refresh token 逻辑
feat(auth): 添加 login 接口
feat(auth): 添加 logout 接口
feat(auth): 添加 JwtAuthGuard
test(auth): 添加 AuthService 密码哈希测试
test(auth): 添加 AuthService login 流程测试
feat(submission): 添加提交实体和 DTO
feat(submission): 添加频率限制逻辑（Redis INCR）
feat(submission): 添加资源倍增（bonus）逻辑
test(submission): 添加频率限制单元测试
```

**错误示范：**
```
feat(auth): 完成认证模块   ← 太粗
feat: 添加各种功能         ← 毫无意义
```

每个 commit 应该只做一件事，能用一句话说清楚。

## 测试要求

- 框架：Jest + `@nestjs/testing`
- 单元测试：所有 Service 方法都有对应测试，mock 所有外部依赖
- 核心链路（submission/receive/heng/auth）覆盖率 ≥ 80%
- 其他模块 ≥ 60%
- 运行：`pnpm test`，`pnpm test:cov`

## Docker

需要提供：
- `Dockerfile`（multi-stage build，最终镜像基于 node alpine）
- `docker-compose.yml`（app + mariadb + redis）
- `.env.example`（所有环境变量模板）

## 注意事项

- ContestUser 有双重认证：`allowDirectLogin=true` 用全站密码，`false` 用竞赛独立密码
- 竞赛支持设备绑定（`deviceBindType`）和 IP 绑定（`bindIp`）
- Problem 有逻辑 ID（`logicId` + `prefix`，如 P1001）和数据库 ID 两套体系
- SubmissionMisc 分表设计保留（代码字段大，列表查询不 JOIN）
- 资源倍增规则保留（Java ×5 内存 ×2 时间，Python ×3 内存 ×2 时间等）
- Heng 协议参考：`/Users/yuzhe/.openclaw/workspace/projects/Heng-Protocol/`
