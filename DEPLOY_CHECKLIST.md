# 生产部署检查清单

> 基于代码审查自动生成。最后更新：2026-03-08

---

## 🔴 MUST DO（必须做，否则无法安全运行）

- [ ] **配置强随机 JWT_ACCESS_SECRET**（至少32字符随机字符串，替换 `.env` 中的 `change_me_access_secret`）
- [ ] **配置强随机 JWT_REFRESH_SECRET**（与上面不同，替换 `change_me_refresh_secret`）
- [ ] **设置 DB_PASSWORD**（替换 `your_password_here`，使用强密码）
- [ ] **设置 DB_ROOT_PASSWORD**（替换默认的 `rootpass`）
- [ ] **修改 INIT_SA_USERNAME / INIT_SA_PASSWORD**（默认 admin/Admin@123456，首次启动前改掉或启动后立即改密码）
- [ ] **设置 NODE_ENV=production**（影响 synchronize、swagger、migrations 等多项行为）
- [ ] **配置 BASE_URL**（公网访问地址，用于 heng 评测回调，如 `https://your-domain.com`）

> ⚠️ **关于 SA 账号：** InitService 使用 `.env` 中 `INIT_SA_USERNAME` / `INIT_SA_PASSWORD` 创建 SA，**不是随机生成**。请务必在部署前配置这两个变量，或首次启动后立即通过 API 修改密码。

---

## 🟡 SHOULD DO（强烈建议）

- [ ] **配置 HENG_BASE_URL、HENG_AK、HENG_SK**（如需真实评测功能；不配则提交无法判题）
- [ ] **设置 HENG_ALLOW_INSECURE_TLS=false**（生产环境必须使用受信 TLS，默认已为 false 但需确认）
- [ ] **配置 Nginx 反向代理**（docker-compose.full.yml 已包含 nginx 服务，确认 `nginx.conf` 存在于后端目录）
- [ ] **配置 GitHub Secrets**（CI/CD 用：`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DB_PASSWORD` 等）
- [ ] **确认 MariaDB 字符集为 utf8mb4**（docker-compose 使用 `mariadb:10.11`，建议在 `nginx.conf` / DB init 中确认）
- [ ] **配置 REDIS_PASSWORD**（docker-compose 中 Redis 无密码，建议生产加密码并在 app 中配置）

---

## 🟢 NICE TO HAVE（可选增强）

- [ ] 配置 Aliyun OSS（不配则使用本地存储，重启 / 迁移后文件可能丢失）
- [ ] 配置 Codecov token（CI 测试覆盖率上报）
- [ ] 配置监控告警（Prometheus + Grafana）
- [ ] 设置 `MAX_SUBMISSION_PER_MINUTE`（默认 10，按需调整限流）

---

## ✅ 已自动处理（代码已验证）

- ✅ `synchronize: false` 在 production（`database.module.ts` 已配置）
- ✅ Swagger 在 production 禁用（`main.ts` 已配置）
- ✅ Migrations 在 production 自动运行（`migrationsRun: NODE_ENV === 'production'`）
- ✅ MariaDB 10.11（docker-compose.full.yml）
- ✅ Redis 7（docker-compose.full.yml）
- ✅ 数据持久化（`db_data` + `redis_data` volumes）
- ✅ 前端 build 输出挂载到 nginx（`frontend_dist` volume）
- ✅ 健康检查（`/health` 接口）

---

## 📋 环境变量速查

| 变量 | 默认值 | 是否必须手动配置 |
|------|--------|----------------|
| `NODE_ENV` | `development` | ✅ MUST → 改为 `production` |
| `DB_DATABASE` | 无 | ✅ REQUIRED |
| `DB_USERNAME` | 无 | ✅ REQUIRED |
| `DB_PASSWORD` | `your_password_here` | ✅ MUST → 强密码 |
| `DB_ROOT_PASSWORD` | `rootpass` | ✅ MUST → 强密码 |
| `JWT_ACCESS_SECRET` | `change_me_access_secret` | ✅ MUST → 随机32+字符 |
| `JWT_REFRESH_SECRET` | `change_me_refresh_secret` | ✅ MUST → 随机32+字符 |
| `BASE_URL` | `http://localhost:3000` | ✅ MUST → 公网地址 |
| `INIT_SA_USERNAME` | `admin` | 🟡 建议修改 |
| `INIT_SA_PASSWORD` | `Admin@123456` | ✅ MUST → 强密码 |
| `HENG_BASE_URL` | 无 | 🟡 评测功能需配置 |
| `HENG_AK` | `your_access_key` | 🟡 评测功能需配置 |
| `HENG_SK` | `your_secret_key` | 🟡 评测功能需配置 |
| `REDIS_PASSWORD` | 无 | 🟢 可选，建议生产配置 |
| `PORT` | `3000` | 无需改（docker 内部） |
| `MAX_SUBMISSION_PER_MINUTE` | `10` | 🟢 按需调整 |

---

## 🚀 启动顺序

```bash
# 1. 准备 .env 文件（从 .env.example 复制并填写所有 MUST 项）
cp .env.example .env
# 编辑 .env，填写所有必须配置项

# 2. 确认 nginx.conf 存在
ls nginx.conf  # docker-compose.full.yml 依赖此文件

# 3. 启动全栈（含 nginx + 前端构建 + 后端 + DB + Redis）
docker-compose -f docker-compose.full.yml up -d

# 4. 查看日志确认 SA 账号创建成功
docker-compose -f docker-compose.full.yml logs app | grep -i "sa\|admin\|初始化"

# 5. 健康检查
curl http://localhost/health
# 或带域名
curl https://your-domain.com/health
```

> ⚠️ **前端注意：** `docker-compose.full.yml` 中 `frontend-builder` 需要 `../leverage-frontend-neo` 目录存在（相对路径）。两个仓库需放在同级目录下。

---

## 已知限制

- 无 Aliyun OSS 配置时使用本地文件存储（容器重建后文件丢失，建议生产挂载持久化 volume 或配置 OSS）
- heng 评测机仅支持 Linux（需要 cgroups + seccomp），macOS 上无法运行评测
- `docker-compose.full.yml` 中 `heng-controller` 服务已注释，需手动构建 image 后启用
- Redis 无密码（docker-compose 默认配置），生产建议加密码
