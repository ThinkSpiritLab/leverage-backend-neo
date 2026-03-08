import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import https from 'https'
import crypto from 'crypto'
import { CreateJudgeRequest } from './heng.types'

/**
 * HengClientService
 *
 * 负责与 heng-controller 通信，包含：
 * - Axios HTTP 客户端配置（支持 HTTPS + 可选跳过证书验证）
 * - HMAC-SHA256 签名（兼容 heng-sign-js 协议）
 * - createJudge：POST /c/v1/judges
 */
@Injectable()
export class HengClientService {
  private readonly logger = new Logger(HengClientService.name)
  private readonly httpClient: AxiosInstance

  constructor(private readonly configService: ConfigService) {
    const baseURL = this.configService.get<string>('heng.baseUrl', '')
    const allowInsecureTls = this.configService.get<boolean>('heng.allowInsecureTls', false)

    this.httpClient = axios.create({
      baseURL,
      timeout: 5000,
      httpsAgent: new https.Agent({
        // HENG_ALLOW_INSECURE_TLS=true 时跳过证书验证（生产环境保持默认 false）
        rejectUnauthorized: !allowInsecureTls,
      }),
    })
  }

  /**
   * 向 heng-controller 提交评测任务
   * POST /c/v1/judges
   */
  async createJudge(request: CreateJudgeRequest): Promise<{ judgeId: string }> {
    const url = '/c/v1/judges'
    const signedHeaders = this.buildSignedHeaders('POST', url, request)

    const res = await this.httpClient.post<{ judgeId: string }>(url, request, {
      headers: signedHeaders,
    })

    this.logger.log(`createJudge success, judgeId=${res.data?.judgeId}`)
    return res.data
  }

  /**
   * 构建 heng-sign-js 兼容的签名 Headers
   *
   * 签名流程（与 heng-sign-js Sign.sign 完全一致）：
   * 1. 构建 signed headers：content-type, x-heng-accesskey, x-heng-nonce, x-heng-timestamp
   * 2. 对每个 header key/value 做 encodeURIComponent().toLowerCase()，按字典序排列，拼成 k=v&k=v
   * 3. bodyHash = SHA256(JSON.stringify(body))
   * 4. requestString = `${METHOD}\n${path}\n${queryString}\n${signedHeaders}\n${bodyHash}\n`
   * 5. signature = HmacSHA256(sk, requestString)
   */
  private buildSignedHeaders(
    method: string,
    path: string,
    body: unknown,
  ): Record<string, string> {
    const ak = this.configService.get<string>('heng.ak', '')
    const sk = this.configService.get<string>('heng.sk', '')

    const contentType = 'application/json;charset=utf-8'
    const nonce = Math.random().toString()
    const timestamp = Math.floor(Date.now() / 1000).toString()

    // Step 1: 拼 signed headers string（encodeURIComponent + sort）
    const headerDict: Record<string, string> = {
      'content-type': contentType,
      'x-heng-accesskey': ak,
      'x-heng-nonce': nonce,
      'x-heng-timestamp': timestamp,
    }
    const signedHeadersStr = this.toLowerCaseSortJoin(headerDict)

    // Step 2: SHA256 body hash
    const bodyJson = body !== undefined ? JSON.stringify(body) : '{}'
    const bodyHash = crypto.createHash('sha256').update(bodyJson).digest('hex')

    // Step 3: request string
    const METHOD = method.toUpperCase()
    const queryStrings = '' // POST 无 query
    const requestString = `${METHOD}\n${path}\n${queryStrings}\n${signedHeadersStr}\n${bodyHash}\n`

    // Step 4: HMAC-SHA256 签名
    const signature = crypto.createHmac('sha256', sk).update(requestString).digest('hex')

    return {
      'content-type': contentType,
      'x-heng-accesskey': ak,
      'x-heng-nonce': nonce,
      'x-heng-timestamp': timestamp,
      'x-heng-signature': signature,
    }
  }

  /**
   * 将 dict 的 key/value 均 encodeURIComponent().toLowerCase()，按字典序排列，拼成 k=v&k=v 字符串
   * （与 heng-sign-js toLowerCaseSortJoin 完全一致）
   */
  private toLowerCaseSortJoin(dict: Record<string, string>): string {
    const kvArray: [string, string][] = Object.entries(dict).map(([k, v]) => [
      encodeURIComponent(k.toLowerCase()),
      encodeURIComponent(v.toLowerCase()),
    ])

    kvArray.sort((a, b) => {
      if (a[0] === b[0]) return a[1] < b[1] ? -1 : 1
      return a[0] < b[0] ? -1 : 1
    })

    return kvArray.map(([k, v]) => `${k}=${v}`).join('&')
  }
}
