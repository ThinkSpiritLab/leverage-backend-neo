import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import * as path from 'path'
import { Problem } from '../../database/entities/problem.entity'
import { Tag } from '../../database/entities/tag.entity'
import { CacheService } from '../redis/cache.service'
import { CreateProblemDto } from './dto/create-problem.dto'
import { UpdateProblemDto } from './dto/update-problem.dto'
import { ProblemQueryDto } from './dto/problem-query.dto'

@Injectable()
export class ProblemService {
  constructor(
    @InjectRepository(Problem)
    private readonly problemRepo: Repository<Problem>,
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 列表（分页 + tag 过滤 + 权限过滤）
   * 非 admin 不返回 closed=true 或 restricted=true 的题目
   */
  async findAll(
    query: ProblemQueryDto,
    isAdmin: boolean,
  ): Promise<{ items: Problem[]; total: number }> {
    const { page = 1, perPage = 20, search, tagIds } = query

    // Fix: 正确的分页 skip
    const skip = (page - 1) * perPage

    const qb = this.problemRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.tags', 'tags')
      .take(perPage)
      .skip(skip)
      .orderBy('p.id', 'DESC')

    // 权限过滤：非 admin 不看 hidden 题
    if (!isAdmin) {
      qb.andWhere('p.closed = :closed', { closed: false })
      qb.andWhere('p.restricted = :restricted', { restricted: false })
    }

    // 标签过滤
    if (tagIds && tagIds.length > 0) {
      qb.andWhere('tags.id IN (:...tagIds)', { tagIds })
    }

    // 搜索（标题/逻辑ID）
    if (search) {
      const match = /^([A-Za-z]+)(\d+)?$/.exec(search)
      if (match) {
        const [, prefix, logicId] = match
        if (logicId && prefix) {
          qb.andWhere(
            '(p.prefix = :prefix AND p.logicId = :logicId OR p.title LIKE :title)',
            {
              prefix: prefix.toLowerCase(),
              logicId: parseInt(logicId),
              title: `%${search}%`,
            },
          )
        } else {
          qb.andWhere('(p.prefix = :prefix OR p.title LIKE :title)', {
            prefix: prefix.toLowerCase(),
            title: `%${search}%`,
          })
        }
      } else {
        qb.andWhere(
          '(p.title LIKE :title OR p.id = :id OR p.logicId = :id)',
          { title: `%${search}%`, id: parseInt(search) || -1 },
        )
      }
    }

    const [items, total] = await qb.getManyAndCount()
    return { items, total }
  }

  /**
   * 详情（缓存 6s）
   * 非 admin 不返回 closed/restricted 的题目
   */
  async findOne(id: number, isAdmin: boolean): Promise<Problem> {
    const cacheKey = `problem:${id}:${isAdmin ? 'admin' : 'user'}`
    const cached = await this.cacheService.get<Problem>(cacheKey)
    if (cached) return cached

    const qb = this.problemRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.tags', 'tags')
      .where('p.id = :id', { id })

    if (!isAdmin) {
      qb.andWhere('p.closed = :closed', { closed: false })
      qb.andWhere('p.restricted = :restricted', { restricted: false })
    }

    const problem = await qb.getOne()
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`)

    await this.cacheService.set(cacheKey, problem, 6)
    return problem
  }

  /**
   * 创建题目
   */
  async create(dto: CreateProblemDto): Promise<Problem> {
    const {
      tagIds,
      prefix = 'p',
      logicId,
      ...rest
    } = dto

    // 自动分配 logicId
    const actualLogicId =
      logicId ?? (await this.getNextLogicId(prefix))

    const tags = tagIds?.length
      ? await this.tagRepo.findBy({ id: In(tagIds) })
      : []

    const problem = this.problemRepo.create({
      ...rest,
      prefix: prefix.toLowerCase(),
      logicId: actualLogicId,
      tags,
    })

    return this.problemRepo.save(problem)
  }

  /**
   * 更新题目
   */
  async update(id: number, dto: UpdateProblemDto): Promise<Problem> {
    const problem = await this.problemRepo.findOne({
      where: { id },
      relations: ['tags'],
    })
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`)

    const { tagIds, ...rest } = dto

    // 更新 tags
    if (tagIds !== undefined) {
      problem.tags = tagIds.length
        ? await this.tagRepo.findBy({ id: In(tagIds) })
        : []
    }

    Object.assign(problem, rest)

    const saved = await this.problemRepo.save(problem)

    // 清除缓存
    await this.cacheService.del(
      `problem:${id}:admin`,
      `problem:${id}:user`,
    )

    return saved
  }

  /**
   * 删除题目
   */
  async remove(id: number): Promise<void> {
    const problem = await this.problemRepo.findOne({ where: { id } })
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`)

    await this.problemRepo.remove(problem)

    // 清除缓存
    await this.cacheService.del(
      `problem:${id}:admin`,
      `problem:${id}:user`,
    )
  }

  /**
   * 上传测试数据（校验必须是 zip）
   * #25 fix: 双重校验 MIME type + 扩展名
   */
  async uploadTestData(id: number, file: Express.Multer.File): Promise<void> {
    this.validateZipFile(file)

    const problem = await this.problemRepo.findOne({ where: { id } })
    if (!problem) throw new NotFoundException(`题目 #${id} 不存在`)

    // 实际上传逻辑（存储到本地/OSS）留给具体部署实现
    // 此处记录文件信息，后续由 heng-controller 读取
    // TODO: 实际项目中此处调用 OSS/MinIO 上传服务
  }

  /**
   * 格式化逻辑 ID，例如 "P1001"
   */
  formatDisplayId(problem: Problem): string {
    return `${problem.prefix.toUpperCase()}${problem.logicId}`
  }

  /**
   * 获取某 prefix 的下一个 logicId（从 1000 开始）
   */
  private async getNextLogicId(prefix: string): Promise<number> {
    const result = await this.problemRepo
      .createQueryBuilder('p')
      .select('MAX(p.logicId)', 'maxId')
      .where('p.prefix = :prefix', { prefix: prefix.toLowerCase() })
      .getRawOne()
    return result?.maxId != null ? result.maxId + 1 : 1000
  }

  /**
   * 校验文件必须是 .zip 格式
   * #25 fix: 通过扩展名 + MIME type 双重验证
   */
  private validateZipFile(file: Express.Multer.File): void {
    const allowedMimeTypes = [
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
    ]
    const ext = path.extname(file.originalname).toLowerCase()
    if (ext !== '.zip' || !allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('测试数据必须是 .zip 文件')
    }
  }
}
