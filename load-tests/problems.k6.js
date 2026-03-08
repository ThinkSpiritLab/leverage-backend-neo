import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const errorRate = new Rate('errors')
const problemsListDuration = new Trend('problems_list_duration')

export const options = {
  stages: [
    { duration: '10s', target: 50 },   // ramp up to 50 VUs
    { duration: '1m', target: 50 },    // steady at 50 VUs
    { duration: '10s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],   // 95%请求<200ms（高频查询）
    errors: ['rate<0.05'],
    problems_list_duration: ['p(95)<200'],
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

// 登录并获取 token（每个 VU 初始化时执行一次）
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
    'setup: login status 201': (r) => r.status === 201,
  })

  const body = JSON.parse(loginRes.body)
  return { accessToken: body.accessToken }
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.accessToken}`,
  }

  // 测试不同分页参数
  const pages = [
    { page: 1, perPage: 10 },
    { page: 1, perPage: 20 },
    { page: 2, perPage: 10 },
  ]
  const { page, perPage } = pages[Math.floor(Math.random() * pages.length)]

  const start = Date.now()
  const res = http.get(`${BASE_URL}/problems?page=${page}&perPage=${perPage}`, {
    headers,
  })
  problemsListDuration.add(Date.now() - start)

  check(res, {
    'problems status 200': (r) => r.status === 200,
    'has data array': (r) => {
      try {
        const body = JSON.parse(r.body)
        return Array.isArray(body.data) || Array.isArray(body.problems) || Array.isArray(body)
      } catch {
        return false
      }
    },
  })

  errorRate.add(res.status !== 200)
  sleep(0.5)
}
