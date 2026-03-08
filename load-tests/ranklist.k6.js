import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const errorRate = new Rate('errors')
const ranklistDuration = new Trend('ranklist_duration')

export const options = {
  stages: [
    { duration: '10s', target: 100 },  // ramp up to 100 VUs
    { duration: '1m', target: 100 },   // steady at 100 VUs（高并发压测 Redis Sorted Set）
    { duration: '10s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<100'],   // 95%请求<100ms（Redis 应该很快）
    errors: ['rate<0.05'],
    ranklist_duration: ['p(95)<100'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

// 使用 setup 获取 token（避免每个 VU 都登录）
export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      username: __ENV.SA_USERNAME || 'admin',
      password: __ENV.SA_PASSWORD || 'Admin@123456',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  )

  check(loginRes, {
    'setup: login ok': (r) => r.status === 201,
  })

  const body = JSON.parse(loginRes.body)
  return { accessToken: body.accessToken }
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.accessToken}`,
  }

  const start = Date.now()
  const res = http.get(`${BASE_URL}/users/ranklist`, { headers })
  ranklistDuration.add(Date.now() - start)

  check(res, {
    'ranklist status 200': (r) => r.status === 200,
    'ranklist has data': (r) => {
      try {
        const body = JSON.parse(r.body)
        return body !== null && body !== undefined
      } catch {
        return false
      }
    },
  })

  errorRate.add(res.status !== 200)
  sleep(0.2)  // 稍微降低请求频率，避免单 VU 过于激进
}
