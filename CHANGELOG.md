# CHANGELOG

## [2.0.0] - 2026-03-08

### 🏗️ 架构重构
- 完整从 Express + 手写框架迁移到 NestJS
- TypeORM 替换自定义 ORM
- BullMQ 替换手写任务队列
- JWT 双 Token（access 15min + refresh 7d）

### ✨ 新功能
- Message 模块（站内信系统，8个 endpoint）
- Compete 模块（AI 对战系统）
- Transmit 模块（heng 评测机集成）
- 健康检查端点（/health, /health/ready, /health/queues）
- TypeORM Migrations（生产环境数据库迁移）
- Profession-College 模块（院系/专业管理）
- 开发种子数据脚本（pnpm seed）

### 🔒 安全加固
- DTO class-validator 验证（12个文件，MaxLength/MinLength）
- 登录接口限速（5次/分钟）
- 全局异常过滤器
- 权限审计（修复 rejudge 权限漏洞）
- JWT 令牌撤销

### ⚡ 性能优化
- Redis Sorted Set 排行榜（O(log n) vs 原来 O(n)）
- 数据库索引（User/Submission/Problem/Contest/ContestUserProblem/Message 6个实体）
- k6 负载测试脚本

### 🧪 测试覆盖
- Unit tests: 0 → 596
- Integration tests: 0 → 42
- E2E tests: 0 → 25
- 总覆盖率: 0% → 95%+

### 📚 文档
- docs/ARCHITECTURE.md
- docs/API.md（60+ endpoints）
- docs/SECURITY.md（权限矩阵）
- docs/DEPLOYMENT.md
- docs/HENG.md
- 6篇技术博客（EN+ZH）

### 🚀 DevOps
- GitHub Actions CI/CD（.github/workflows/ci.yml + deploy.yml）
- Docker Compose 完整配置
- Healthcheck 配置
- 开发种子数据脚本（pnpm seed）
