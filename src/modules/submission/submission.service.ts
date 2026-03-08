import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { InjectRepository } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'
import type { Queue } from 'bull'
import { Repository } from 'typeorm'
import { Submission } from '../../database/entities/submission.entity'
import { SubmissionMisc } from '../../database/entities/submission-misc.entity'
import { Problem } from '../../database/entities/problem.entity'
import { RedisService } from '../redis/redis.service'
import { JUDGE_TX_QUEUE } from '../queue/queue.constants'
import { Status } from '../heng/heng.types'
import { LANGUAGE_BONUS, MAX_MEMORY_LIMIT } from '../../common/constants/submission.constants'
import { CreateSubmissionDto } from './dto/create-submission.dto'
import { SubmissionQueryDto } from './dto/submission-query.dto'

@Injectable()
export class SubmissionService {
  private readonly logger = new Logger(SubmissionService.name)

  constructor(
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    @InjectRepository(SubmissionMisc)
    private readonly miscRepo: Repository<SubmissionMisc>,
    @InjectRepository(Problem)
    private readonly problemRepo: Repository<Problem>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @InjectQueue(JUDGE_TX_QUEUE)
    private readonly judgeTxQueue: Queue,
  ) {}

  /**
   * 创建提交（核心方法）
   */
  async create(userId: number, dto: CreateSubmissionDto): Promise<Submission> {
    // 1. 频率限制
    await this.checkRateLimit(userId)

    // 2. 查题目（TypeORM 内置 cache 6s）
    const problem = await this.problemRepo.findOne({
      where: { id: dto.problemId },
      cache: 6000,
    })
    if (!problem) throw new NotFoundException(`题目 #${dto.problemId} 不存在`)

    // 3. 资源倍增
    const { timeLimit, memoryLimit } = this.applyLanguageBonus(problem, dto.language)

    // 4. 写 Submission（status: PENDING）
    const submission = await this.submissionRepo.save({
      userId,
      problemId: dto.problemId,
      language: dto.language,
      status: Status.PENDING,
      contestId: dto.contestId ?? null,
      courseId: dto.courseId ?? null,
    })

    // 5. 写 SubmissionMisc（分表，代码单独存）
    await this.miscRepo.save({
      submissionId: submission.id,
      code: dto.code,
    })

    // 6. 推入 judge-tx 队列
    const testDataUrl = this.buildTestDataUrl(problem)
    await this.judgeTxQueue.add('judge', {
      submissionId: submission.id,
      task: {
        language: dto.language,
        code: dto.code,
        timeLimit,
        memoryLimit,
        testDataUrl,
      },
    })

    this.logger.log(
      `Submission created: id=${submission.id}, userId=${userId}, problemId=${dto.problemId}`,
    )

    return submission
  }

  /**
   * 列表查询（分页，支持按用户/题目/状态筛选）
   */
  async findAll(
    query: SubmissionQueryDto,
  ): Promise<{ items: Submission[]; total: number }> {
    const {
      page = 1,
      perPage = 20,
      userId,
      problemId,
      status,
      contestId,
      courseId,
    } = query

    const skip = (page - 1) * perPage

    const qb = this.submissionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.problem', 'problem')
      .leftJoinAndSelect('s.user', 'user')
      .take(perPage)
      .skip(skip)
      .orderBy('s.id', 'DESC')

    if (userId !== undefined) qb.andWhere('s.userId = :userId', { userId })
    if (problemId !== undefined) qb.andWhere('s.problemId = :problemId', { problemId })
    if (status !== undefined) qb.andWhere('s.status = :status', { status })
    if (contestId !== undefined) qb.andWhere('s.contestId = :contestId', { contestId })
    if (courseId !== undefined) qb.andWhere('s.courseId = :courseId', { courseId })

    const [items, total] = await qb.getManyAndCount()
    return { items, total }
  }

  /**
   * 详情（含 SubmissionMisc）
   */
  async findOne(id: number): Promise<Submission & { misc: SubmissionMisc }> {
    const submission = await this.submissionRepo.findOne({
      where: { id },
      relations: ['misc', 'problem', 'user'],
    })
    if (!submission) throw new NotFoundException(`提交 #${id} 不存在`)
    return submission as Submission & { misc: SubmissionMisc }
  }

  /**
   * 重评（重新推入队列）
   */
  async rejudge(id: number): Promise<void> {
    const submission = await this.submissionRepo.findOne({
      where: { id },
      relations: ['problem'],
    })
    if (!submission) throw new NotFoundException(`提交 #${id} 不存在`)

    const misc = await this.miscRepo.findOne({ where: { submissionId: id } })
    if (!misc) throw new NotFoundException(`提交 #${id} 的代码不存在`)

    // 重置状态
    await this.submissionRepo.update(id, {
      status: Status.PENDING,
      judger: null,
    })

    // 资源倍增
    const { timeLimit, memoryLimit } = this.applyLanguageBonus(
      submission.problem,
      submission.language,
    )

    // 推入 judge-tx 队列
    await this.judgeTxQueue.add('judge', {
      submissionId: submission.id,
      task: {
        language: submission.language,
        code: misc.code,
        timeLimit,
        memoryLimit,
        testDataUrl: this.buildTestDataUrl(submission.problem),
      },
    })

    this.logger.log(`Rejudge queued: submissionId=${id}`)
  }

  /**
   * 前端轮询提交状态（从 Redis 读，快速）
   */
  async getStatus(id: number): Promise<{ status: number }> {
    const cacheKey = `submission-status:${id}`
    const cached = await this.redisService.get(cacheKey)
    if (cached !== null) {
      return { status: parseInt(cached, 10) }
    }

    // Redis 没有则从 DB 读
    const submission = await this.submissionRepo.findOne({
      where: { id },
      select: ['id', 'status'],
    })
    if (!submission) throw new NotFoundException(`提交 #${id} 不存在`)
    return { status: submission.status }
  }

  /**
   * 频率限制（Redis INCR + TTL 60s）
   */
  private async checkRateLimit(userId: number): Promise<void> {
    const key = `submit-throttle:${userId}`
    const count = await this.redisService.incr(key)
    if (count === 1) {
      await this.redisService.expire(key, 60)
    }
    const max = this.configService.get<number>('submission.maxPerMinute', 10)
    if (count > max) {
      throw new HttpException(
        '提交过于频繁，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  /**
   * 资源倍增（Language bonus）
   * 将 memoryLimit（MB）和 timeLimit（ms/s，视原始单位）乘以对应系数
   */
  applyLanguageBonus(
    problem: Problem,
    language: number,
  ): { timeLimit: number; memoryLimit: number } {
    const languageName = this.getLanguageName(language)
    const bonus = languageName ? LANGUAGE_BONUS[languageName] : undefined

    let { timeLimit, memoryLimit } = problem

    if (bonus) {
      timeLimit = timeLimit * bonus.timeMultiplier
      memoryLimit = memoryLimit * bonus.memoryMultiplier

      // 保证最小内存（byte → MB 换算：bonus.minMemory 是 byte，problem.memoryLimit 是 MB）
      if (bonus.minMemory !== undefined) {
        const minMemoryMb = bonus.minMemory / (1024 * 1024)
        memoryLimit = Math.max(memoryLimit, minMemoryMb)
      }

      // 保证不超过上限（1GB = 1024 MB）
      const maxMemoryMb = MAX_MEMORY_LIMIT / (1024 * 1024)
      memoryLimit = Math.min(memoryLimit, maxMemoryMb)
    }

    return { timeLimit, memoryLimit }
  }

  /**
   * 构建测试数据 URL（供 heng-controller 下载）
   */
  private buildTestDataUrl(problem: Problem): string {
    const baseUrl = this.configService.get<string>('baseUrl', 'http://localhost:3000')
    return `${baseUrl}/problems/${problem.id}/test-data`
  }

  /**
   * language 数字 → 语言名称（用于查 LANGUAGE_BONUS）
   */
  private getLanguageName(language: number): string | undefined {
    const map: Record<number, string> = {
      6: 'java',
      7: 'kotlin',
      8: 'python2',
      9: 'python3',
      10: 'javascript',
      11: 'typescript',
    }
    return map[language]
  }
}
