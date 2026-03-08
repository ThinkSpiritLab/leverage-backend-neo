import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const errorRate = new Rate('errors')
const enqueueDuration = new Trend('enqueue_duration')

export const options = {
  stages: [
    { duration: '10s', target: 20 },   // ramp up to 20 VUs
    { duration: '30s', target: 20 },   // steady at 20 VUs
    { duration: '5s', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],  // BullMQ 入队 95%<1s
    errors: ['rate<0.1'],               // 允许稍高错误率（rate limit）
    enqueue_duration: ['p(95)<1000'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

// 多账号配置，规避 rate limit（10次/分钟/用户）
// 通过环境变量传入，格式：user1:pass1,user2:pass2,...
function getAccounts() {
  const accountsEnv = __ENV.SA_ACCOUNTS
  if (accountsEnv) {
    return accountsEnv.split(',').map((pair) => {
      const [username, password] = pair.split(':')
      return { username, password }
    })
  }
  // 默认单账号（测试用）
  return [
    { username: __ENV.SA_USERNAME || 'admin', password: __ENV.SA_PASSWORD || 'Admin@123456' },
  ]
}

export function setup() {
  const accounts = getAccounts()
  const tokens = []

  for (const account of accounts) {
    const loginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify(account),
      {
        headers: { 'Content-Type': 'application/json' },
      },
    )

    if (loginRes.status === 201) {
      const body = JSON.parse(loginRes.body)
      tokens.push(body.accessToken)
    }
  }

  console.log(`Loaded ${tokens.length} account token(s) for submission test`)
  return { tokens }
}

// 示例提交 payload（根据实际 API 结构调整）
function makeSubmissionPayload() {
  const problemIds = __ENV.SA_PROBLEM_IDS
    ? __ENV.SA_PROBLEM_IDS.split(',')
    : ['1', '2', '3']

  const problemId = problemIds[Math.floor(Math.random() * problemIds.length)]
  const languages = ['cpp', 'python', 'java', 'javascript']
  const language = languages[Math.floor(Math.random() * languages.length)]

  return {
    problemId: parseInt(problemId),
    language,
    code: `// k6 load test submission\nint main() { return 0; }`,
  }
}

export default function (data) {
  const { tokens } = data

  // 每个 VU 随机选一个账号 token（分散 rate limit）
  const token = tokens[__VU % tokens.length]

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const payload = makeSubmissionPayload()

  const start = Date.now()
  const res = http.post(
    `${BASE_URL}/submissions`,
    JSON.stringify(payload),
    { headers },
  )
  enqueueDuration.add(Date.now() - start)

  check(res, {
    'submission accepted (201)': (r) => r.status === 201,
    'submission queued (202)': (r) => r.status === 202,
    'not rate limited (429)': (r) => r.status !== 429,
  })

  // 429 也算错误
  errorRate.add(res.status !== 201 && res.status !== 202)

  // 注意：rate limit 10次/分钟/用户，20 VU 每次 sleep 6s = ~200次/分钟总量
  // 实际每个用户约 3次/分钟，低于限制
  sleep(6)
}
