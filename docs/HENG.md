# Heng 评测机接入指南

本文档说明如何将 Leverage OJ 与 [heng-controller](https://github.com/ThinkSpiritLab/heng-controller)（众衡评测系统控制端）集成。

---

## 1. heng 架构简介

**heng-controller** 是 ThinkSpirit 实验室开发的在线评测系统控制端，负责：

- 接收来自 OJ 后端的评测任务（`POST /c/v1/judges`）
- 通过 WebSocket 与评测机（judger）保持长连接，分发任务至沙箱评测
- 评测完成后，通过 HTTP 回调通知 OJ 后端结果

**与 Leverage 的关系：**

```
Leverage Backend Neo                heng-controller               heng judger (沙箱)
─────────────────────               ───────────────               ─────────────────
JudgeWorker                         WebSocket server              评测沙箱
  │                                       │                              │
  │── POST /c/v1/judges ──────────────────▶                              │
  │   (HMAC-SHA256 签名)                  │── 分发评测任务 ─────────────▶│
  │                                       │◀─ 评测结果 ─────────────────│
  │◀── POST /heng/finish/:id/:jid ────────│
       (heng 回调 Leverage)
```

heng-controller 本身是一个 NestJS 应用，目前**没有官方发布的 Docker image**，需要手动构建或在宿主机上运行。

---

## 2. 本地开发（Mock 模式）

**本地开发无需真实 heng-controller。** E2E 测试已使用 [nock](https://github.com/nock/nock) mock 了所有对 heng-controller 的 HTTP 请求。

运行 E2E 测试：

```bash
pnpm test:e2e
```

相关 mock 逻辑位于 `test/` 目录下的 E2E 测试文件中，会自动拦截 `POST /c/v1/judges` 并模拟 heng 回调。

---

## 3. 真实 heng 接入步骤

### 3.1 获取并部署 heng-controller

heng-controller 目前需要手动构建：

```bash
git clone https://github.com/ThinkSpiritLab/heng-controller
cd heng-controller
yarn install
# 复制并修改配置
cp config/config.example.yaml config/config.yaml
# 本地启动
yarn start:prod
```

或使用 Docker 本地构建：

```bash
docker build -t heng-controller:local .
docker run -d \
  --name heng-controller \
  -p 5000:5000 \
  -e REDIS_HOST=localhost \
  heng-controller:local
```

> 具体端口和环境变量以 `heng-controller/config/` 中的实际配置为准。

### 3.2 Leverage 所需环境变量

在 Leverage 的 `.env` 文件中配置以下变量：

| 变量名 | 说明 | 示例 |
|---|---|---|
| `HENG_BASE_URL` | heng-controller 的 HTTP 基础地址 | `http://localhost:5000` |
| `HENG_AK` | heng-controller 颁发的 Access Key | `your_access_key` |
| `HENG_SK` | heng-controller 颁发的 Secret Key | `your_secret_key` |
| `HENG_ALLOW_INSECURE_TLS` | 跳过 TLS 证书验证（仅开发用） | `false` |
| `HENG_CALLBACK_BASE` | Leverage 对外可访问地址（heng 用于回调） | `http://your-server.example.com` |

### 3.3 配置 heng-controller 回调地址

heng-controller 需要知道 Leverage 的回调地址，用于推送评测结果：

- **状态更新回调：** `POST {HENG_CALLBACK_BASE}/heng/update`
- **评测完成回调：** `POST {HENG_CALLBACK_BASE}/heng/finish/:submissionId/:judgeId`

请在 heng-controller 的配置文件（`config/config.yaml`）中将回调 URL 设置为上述地址。

### 3.4 测试连通性

部署完成后，可通过以下接口验证 heng-controller 是否有评测机在线：

```bash
# 列出已连接的评测机（judgers）
curl -s http://localhost:5000/transmit/judgers | jq
```

若返回非空数组，说明有评测机已连接并准备就绪。

---

## 4. 评测流程图

```
用户提交代码
    │
    ▼
POST /submissions
    │
    ├── 写入 DB（状态: PENDING）
    └── BullMQ 入队（judge 队列）
              │
              ▼
        JudgeWorker（消费队列）
              │
              └── heng-client → POST heng-controller/c/v1/judges
                                  (携带 HMAC-SHA256 签名 Header)
                                        │
                                        ▼
                                  heng 评测（沙箱执行）
                                        │
                                        ▼（评测完成）
                  POST /heng/finish/:submissionId/:judgeId
                  ← heng-controller 回调 Leverage
                                        │
                                        ▼
                              HengController（接收回调）
                                        │
                              JudgeRxWorker（处理结果）
                                        │
                              ┌─────────┴─────────┐
                              ▼                   ▼
                        更新 DB 状态         更新 Redis 排行榜
                     (ACCEPTED/WA/TLE...)
```

---

## 5. 安全注意事项

### HMAC-SHA256 签名

Leverage 向 heng-controller 发起请求时，每次请求都使用 HMAC-SHA256 对请求内容进行签名（兼容 `heng-sign-js` 协议）。签名流程：

1. 构建 signed headers：`content-type`、`x-heng-accesskey`、`x-heng-nonce`、`x-heng-timestamp`
2. 对 header key/value 做 `encodeURIComponent().toLowerCase()`，按字典序排列，拼成 `k=v&k=v`
3. 计算请求体的 SHA256 hash
4. 构造 request string：`{METHOD}\n{path}\n{queryString}\n{signedHeaders}\n{bodyHash}\n`
5. `signature = HMAC-SHA256(sk, requestString)`，附加到 `x-heng-signature` header

详细实现见 `src/modules/heng/heng-client.service.ts`。

### 密钥管理

- **绝对不要将 `HENG_SK` 提交到 Git 仓库。**
- 生产环境应通过 Secrets Manager（如 AWS Secrets Manager、Vault）或 CI/CD 环境变量注入。
- 如果 Secret Key 泄露，立即在 heng-controller 管理界面重置并更新 Leverage 的配置。
- `HENG_ALLOW_INSECURE_TLS` 在生产环境必须保持 `false`，确保 TLS 证书验证开启。
