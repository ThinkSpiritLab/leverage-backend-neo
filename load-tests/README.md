# k6 负载测试

使用 [k6](https://k6.io/) 对 Leverage Backend Neo 关键接口进行性能基线测试。

## 安装 k6

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker run --rm -i grafana/k6 run - <load-tests/auth.k6.js
```

## 测试脚本说明

| 脚本 | 接口 | 并发 | 阈值 |
|------|------|------|------|
| `auth.k6.js` | `POST /auth/login` | 20 VU | p(95) < 500ms |
| `problems.k6.js` | `GET /problems` | 50 VU | p(95) < 200ms |
| `ranklist.k6.js` | `GET /users/ranklist` | 100 VU | p(95) < 100ms |
| `submissions.k6.js` | `POST /submissions` | 20 VU | p(95) < 1000ms |

## 运行方式

### 单项测试

```bash
# 基础运行（默认连接 localhost:3000）
k6 run load-tests/auth.k6.js

# 指定目标服务器
k6 run -e BASE_URL=http://localhost:3000 load-tests/auth.k6.js

# 指定账号
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e SA_USERNAME=admin \
  -e SA_PASSWORD=Admin@123456 \
  load-tests/auth.k6.js
```

### 题目列表测试

```bash
k6 run -e BASE_URL=http://localhost:3000 load-tests/problems.k6.js
```

### 排行榜压测（100并发）

```bash
k6 run -e BASE_URL=http://localhost:3000 load-tests/ranklist.k6.js
```

### 提交接口测试（多账号规避 rate limit）

```bash
# 使用多账号（格式：user1:pass1,user2:pass2）
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e SA_ACCOUNTS=admin:Admin@123456,user1:Pass@123456,user2:Pass@123456 \
  -e SA_PROBLEM_IDS=1,2,3 \
  load-tests/submissions.k6.js

# 单账号（注意 rate limit 10次/分钟）
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e SA_USERNAME=admin \
  -e SA_PASSWORD=Admin@123456 \
  load-tests/submissions.k6.js
```

### 运行全部测试

```bash
for f in load-tests/*.k6.js; do
  echo "=== Running $f ==="
  k6 run -e BASE_URL=http://localhost:3000 "$f"
done
```

或使用 npm scripts：

```bash
npm run load-test          # 运行 auth 测试
npm run load-test:all      # 运行全部测试
```

## 输出解读

```
✓ login status 201          # check 通过
✗ has accessToken           # check 失败

http_req_duration............: avg=42ms min=12ms med=38ms max=312ms p(90)=89ms p(95)=120ms
http_req_failed..............: 0.00%
iterations...................: 1200   # 总请求数
vus..........................: 20     # 当前虚拟用户数
```

### 关键指标

- **p(95)**: 95% 的请求响应时间，是核心 SLA 指标
- **http_req_failed**: HTTP 错误率
- **errors**: 自定义错误率（check 失败 + HTTP 错误）
- **iterations**: 完成的测试迭代次数

## 性能基线目标

| 接口 | p(95) 目标 | 备注 |
|------|-----------|------|
| 登录 | < 500ms | 含 bcrypt 加密 |
| 题目列表 | < 200ms | 高频查询，需缓存 |
| 排行榜 | < 100ms | Redis Sorted Set |
| 提交入队 | < 1000ms | BullMQ 异步队列 |

## 注意事项

1. **提交接口有 rate limit**：10次/分钟/用户，使用 `SA_ACCOUNTS` 传入多账号
2. **排行榜测试 100 并发**：确保 Redis 连接池配置足够大
3. **测试前确认服务运行**：`curl http://localhost:3000/health`
4. **生产环境谨慎**：大并发测试会对数据库造成压力，建议在测试环境运行
