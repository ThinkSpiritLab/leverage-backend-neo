## 开发种子数据

### 前置条件

- 已配置好 `.env`（数据库 + Redis）
- 已运行 `pnpm migration:run` 或 `synchronize` 已初始化表结构

### 注入测试数据

```bash
pnpm seed
```

### 清理测试数据

```bash
pnpm seed:clear
```

### 测试账号

| 类型     | 用户名          | 密码          |
|----------|-----------------|---------------|
| 普通用户 | user1 ~ user10  | Test@123456   |
| 管理员   | testadmin       | Admin@123456  |
| 超管     | 见 InitModule   | 查 `.env` 或数据库 |

> 超管账号（sa）由 `InitModule` 在应用启动时自动创建，密码来自环境变量 `INIT_SA_PASSWORD`，不由种子脚本管理。

### 种子数据内容

| 类型 | 内容 |
|------|------|
| 普通用户 | user1 - user10（权限 `user`） |
| 管理员 | testadmin（权限 `admin`） |
| 标签 | 动态规划、图论、字符串 |
| 题目 | SEED-1001 A+B Problem |
| | SEED-1002 斐波那契数列 |
| | SEED-1003 快速排序 |
| | SEED-1004 字符串反转 |
| | SEED-1005 最短路径（Dijkstra） |
| 竞赛 | SEED 测试竞赛（含 1001-1003） |
| 课程 | SEED 测试课程（含全部 5 题） |

### 幂等性

两个脚本均为**幂等**操作：

- `pnpm seed` — 已存在的记录自动跳过，可重复运行
- `pnpm seed:clear` — 仅删除 SEED 前缀数据，不影响 sa 账号及其他数据
