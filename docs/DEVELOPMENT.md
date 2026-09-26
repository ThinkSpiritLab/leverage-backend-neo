# 开发指南

## 快速启动

```bash
cp .env.example .env
# 填写 .env 中空白的 DB、JWT 密钥及首次 SA 密码；不要提交 .env
# 只启动 MariaDB 和 Redis，均仅绑定宿主回环地址
docker compose up -d db redis
# backend 在宿主机运行，使用 Node 22、pnpm 与 Docker CLI
pnpm install --frozen-lockfile
pnpm judge:image
pnpm start:dev
```

## 环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 监听端口 |
| `NODE_ENV` | `development` | 运行环境 |
| `SKIP_INIT` | `false` | 跳过首次初始化（含自动创建 sa 账号） |
| `DB_HOST` | `localhost` | 数据库主机 |
| `DB_PORT` | `3306` | 数据库端口 |
| `DB_DATABASE` | — | 数据库名（必填） |
| `DB_USERNAME` | — | 数据库用户名（必填） |
| `DB_PASSWORD` | — | 数据库密码（必填） |
| `DB_ROOT_PASSWORD` | — | 本地 Compose MariaDB root 密钥，需显式配置 |
| `REDIS_HOST` | `localhost` | Redis 主机 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `JWT_ACCESS_SECRET` | — | JWT access token 签名密钥（生产必填）|
| `JWT_REFRESH_SECRET` | — | JWT refresh token 签名密钥（生产必填）|
| `JWT_ACCESS_EXPIRES_IN` | `15m` | access token 过期时间 |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | refresh token 过期时间 |

| `MAX_SUBMISSION_PER_MINUTE` | `10` | 每分钟最大提交次数 |
| `INIT_SA_USERNAME` | `admin` | 首次启动创建的 sa 账号用户名 |
| `INIT_SA_PASSWORD` | — | 首次启动必须显式设置；生产环境至少 16 字符 |

## API 文档

启动后访问 http://localhost:3000/api/docs

## 队列管理

访问 http://localhost:3000/admin/queues

（Bull Board 已集成，展示内部评测队列状态）

## 指标监控

访问 http://localhost:3000/metrics

（Prometheus 格式，可接入 Grafana）

## 健康检查

访问 http://localhost:3000/health

## 模块结构

```
src/
├── app.module.ts          # 根模块
├── main.ts                # 启动入口
├── config/                # 配置加载
├── common/                # 公共装饰器/守卫/工具
├── database/              # TypeORM 配置 + 实体
├── logger/                # nestjs-pino 配置
└── modules/
    ├── auth/              # JWT 认证
    ├── user/              # 用户管理
    ├── problem/           # 题目
    ├── submission/        # 提交
    ├── judge-runtime/     # 内部 Docker 沙箱与 OJ/Bot 对局 worker
    ├── receive/           # 评测结果接收
    ├── contest/           # 竞赛
    ├── course/            # 课程
    ├── rank/              # 排行榜
    ├── tag/               # 标签
    ├── profession-college/ # 专业/学院
    ├── setting/           # 系统设置
    ├── log/               # 操作日志
    ├── notification/      # 通知
    ├── media/             # 媒体文件
    ├── statistics/        # 统计
    ├── suspicion/         # 防作弊
    ├── compete/           # Bot 对战
    ├── init/              # 首次初始化
    ├── redis/             # Redis 服务
    ├── queue/             # Bull 队列
    ├── health/            # 健康检查
    └── metrics/           # Prometheus 指标
```

## 权限体系

权限数字越小，权限越高：

| 角色 | 权重 | 说明 |
|------|------|------|
| `sa` | 0 | 超级管理员 |
| `admin` | 1 | 管理员 |
| `supervisor` | 2 | 监督员（可查看竞赛详情、可疑提交等）|
| `user` | 3 | 普通用户 |
| `contest-user` | 4 | 竞赛用户（仅限竞赛场景） |
| `guest` | 5 | 访客 |

## 评测链路

```
POST /submissions
  → DB 记录 PENDING 状态与 judgeAttempt
  → Bull judge-tx 队列中的 internal-submission 任务
  → 同仓库 BACKEND_ROLE=all/worker 读取可信测试数据
  → Docker 独立容器内执行用户代码（禁网、只读根文件系统、资源限额）
  → ReceiveService 在数据库事务内结算；Redis 排行榜由结算后更新
```
