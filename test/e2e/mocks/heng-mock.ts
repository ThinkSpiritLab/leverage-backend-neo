import nock from 'nock'

export interface MockJudgeResult {
  submissionId: number
  judgeId: string
  status: 'Accepted' | 'WrongAnswer' | 'TimeLimitExceeded' | 'MemoryLimitExceeded' | 'RuntimeError' | 'CompileError'
  time?: number
  memory?: number
  message?: string
}

/**
 * 拦截 heng-client 的 POST /c/v1/judges 请求
 * 返回假的 judgeId，不实际发送给 heng
 *
 * 注意：JudgeTxWorker 自己生成 judgeId（randomBytes），不使用 heng 返回的 judgeId。
 * 所以这里的 judgeId 返回值对业务流程无影响，只是让 axios 请求成功即可。
 */
export function mockHengCreateJudge(baseURL: string, judgeId: string = 'mock-judge-id-001') {
  return nock(baseURL)
    .post('/c/v1/judges')
    .reply(200, { judgeId })
}

/**
 * 清理所有 nock 拦截
 */
export function cleanupNockMocks() {
  nock.cleanAll()
}
