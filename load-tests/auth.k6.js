import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

const errorRate = new Rate('errors')

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up
    { duration: '1m', target: 20 },    // steady
    { duration: '10s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // 95%请求<500ms
    errors: ['rate<0.05'],              // 错误率<5%
  },
}

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

export default function () {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      username: __ENV.SA_USERNAME || 'admin',
      password: __ENV.SA_PASSWORD || 'Admin@123456',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  )

  check(res, {
    'login status 201': (r) => r.status === 201,
    'has accessToken': (r) => {
      try {
        return JSON.parse(r.body).accessToken !== undefined
      } catch {
        return false
      }
    },
  })

  errorRate.add(res.status !== 201)
  sleep(1)
}
