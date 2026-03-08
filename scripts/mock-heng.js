#!/usr/bin/env node
/**
 * Mock Heng Controller
 * 模拟 heng-controller 的 HTTP 行为，用于本地开发测试
 *
 * 行为：
 * 1. 接受 POST /c/v1/judges → 返回 judgeId
 * 2. 2 秒后模拟 update 回调（JUDGING 状态）
 * 3. 再 1 秒后模拟 finish 回调（默认 AC，或根据代码内容决定结果）
 *
 * 用法：
 *   node scripts/mock-heng.js
 *   node scripts/mock-heng.js --result=WA    # 全部返回 WA
 *   node scripts/mock-heng.js --result=CE    # 全部返回 CE
 *   node scripts/mock-heng.js --result=TLE   # 全部返回 TLE
 *   node scripts/mock-heng.js --delay=500    # 500ms 后返回结果（默认 2000ms）
 *
 * 配置 .env：
 *   HENG_BASE_URL=http://localhost:5010
 *   HENG_AK=mock-ak
 *   HENG_SK=mock-sk
 */

const http = require('http')
const { randomUUID } = require('crypto')

// ─── CLI 参数解析 ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace('--', '').split('=')
  acc[key] = val
  return acc
}, {})

const DEFAULT_RESULT = args.result || 'AC'
const DELAY_MS = parseInt(args.delay || '2000', 10)
const PORT = parseInt(args.port || '5010', 10)

// ─── 预设结果 ──────────────────────────────────────────────────────────────────
const RESULT_MAP = {
  AC: {
    cases: [
      { kind: 'Accepted', time: 42, memory: 3145728 },
    ],
  },
  WA: {
    cases: [
      { kind: 'Accepted', time: 38, memory: 2097152 },
      { kind: 'WrongAnswer', time: 45, memory: 2359296, extraMessage: 'expected 42, got 43' },
    ],
  },
  TLE: {
    cases: [
      { kind: 'Accepted', time: 40, memory: 2097152 },
      { kind: 'TimeLimitExceeded', time: 2000, memory: 2097152 },
    ],
  },
  MLE: {
    cases: [
      { kind: 'MemoryLimitExceeded', time: 120, memory: 268435456 },
    ],
  },
  RE: {
    cases: [
      { kind: 'RuntimeError', time: 10, memory: 1048576, extraMessage: 'Segmentation fault (core dumped)' },
    ],
  },
  CE: {
    cases: [],
    extra: {
      user: {
        compileMessage: "error: 'cout' was not declared in this scope\n  cout << \"hello\";\n  ^\ncompilation terminated.",
        compileTime: 1200,
      },
    },
  },
  PE: {
    cases: [
      { kind: 'PresentationError', time: 35, memory: 2097152 },
    ],
  },
}

// ─── HTTP 工具 ─────────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', chunk => data += chunk)
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')) }
      catch { resolve({}) }
    })
  })
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) })
  res.end(json)
}

async function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const data = JSON.stringify(body)
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      res.resume()
      resolve(res.statusCode)
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// ─── 回调模拟 ──────────────────────────────────────────────────────────────────
async function simulateJudge(submissionId, judgeId, callbackUrls, result) {
  const updateUrl = callbackUrls.update.replace(':submissionId', submissionId).replace(':judgeId', judgeId)
  const finishUrl = callbackUrls.finish.replace(':submissionId', submissionId).replace(':judgeId', judgeId)

  // 第一步：JUDGING 状态更新
  await new Promise(r => setTimeout(r, DELAY_MS * 0.5))
  console.log(`[mock-heng] → update(JUDGING) submissionId=${submissionId}`)
  try {
    await postJson(updateUrl, { state: 'judging' })
  } catch (e) {
    console.error(`[mock-heng] update callback failed: ${e.message}`)
  }

  // 第二步：finish 最终结果
  await new Promise(r => setTimeout(r, DELAY_MS * 0.5))
  console.log(`[mock-heng] → finish(${result}) submissionId=${submissionId}`)
  try {
    const finishBody = { ...RESULT_MAP[result], judger: 'mock-heng' }
    await postJson(finishUrl, finishBody)
  } catch (e) {
    console.error(`[mock-heng] finish callback failed: ${e.message}`)
  }
}

// ─── 交互式模式（每次提交前询问结果）──────────────────────────────────────────
const pendingJobs = []  // { submissionId, judgeId, callbackUrls }

function promptForResult() {
  if (pendingJobs.length === 0) return
  const job = pendingJobs.shift()
  const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout })
  readline.question(`\n[mock-heng] submissionId=${job.submissionId} 结果? (AC/WA/TLE/MLE/RE/CE/PE, 默认${DEFAULT_RESULT}): `, (answer) => {
    readline.close()
    const result = RESULT_MAP[answer?.toUpperCase()] ? answer.toUpperCase() : DEFAULT_RESULT
    simulateJudge(job.submissionId, job.judgeId, job.callbackUrls, result)
      .then(() => promptForResult())
  })
}

// ─── HTTP Server ───────────────────────────────────────────────────────────────
const INTERACTIVE = args.interactive === 'true' || args.i === 'true'

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/c/v1/judges') {
    const body = await readBody(req)
    const judgeId = `mock-${randomUUID().slice(0, 8)}`

    // 解析 submissionId（从 callbackUrls 路径提取）
    let submissionId = 'unknown'
    if (body.callbackUrls?.finish) {
      const match = body.callbackUrls.finish.match(/\/heng\/finish\/(\d+)\//)
      if (match) submissionId = match[1]
    }

    console.log(`[mock-heng] ← createJudge submissionId=${submissionId} judgeId=${judgeId} lang=${body.judge?.user?.environment?.language || '?'}`)

    sendJson(res, 200, { judgeId })

    if (INTERACTIVE) {
      pendingJobs.push({ submissionId, judgeId, callbackUrls: body.callbackUrls })
      if (pendingJobs.length === 1) setTimeout(promptForResult, 100)
    } else {
      // 自动模式：直接返回预设结果
      simulateJudge(submissionId, judgeId, body.callbackUrls, DEFAULT_RESULT).catch(console.error)
    }
  } else {
    sendJson(res, 404, { error: 'Not found' })
  }
})

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║           🎭 Mock Heng Controller                    ║
╠══════════════════════════════════════════════════════╣
║  监听端口: ${PORT}                                      ║
║  默认结果: ${DEFAULT_RESULT}                                    ║
║  延迟时间: ${DELAY_MS}ms                                  ║
║  交互模式: ${INTERACTIVE ? '✅ 每次提交前询问' : '❌ 全部返回预设结果'}             ║
╠══════════════════════════════════════════════════════╣
║  .env 配置:                                          ║
║    HENG_BASE_URL=http://localhost:${PORT}               ║
║    HENG_AK=mock-ak                                   ║
║    HENG_SK=mock-sk                                   ║
╚══════════════════════════════════════════════════════╝
  `)
})

server.on('error', (e) => {
  console.error(`[mock-heng] Server error: ${e.message}`)
  process.exit(1)
})
