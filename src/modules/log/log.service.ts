import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Log } from '../../database/entities/log.entity'

export interface LogQuery {
  userId?: number
  page: number
  perPage: number
}

export interface PaginatedLogs {
  items: Log[]
  total: number
  page: number
  perPage: number
}

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(Log)
    private readonly logRepo: Repository<Log>,
  ) {}

  /**
   * 创建操作日志
   */
  async create(userId: number, action: string, detail: string): Promise<void> {
    await this.logRepo.save({
      callerId: userId,
      action,
      payload: detail,
      field: action.split('.')[0] ?? null,
    })
  }

  /**
   * 查询操作日志（分页）
   */
  async findAll(query: LogQuery): Promise<PaginatedLogs> {
    const { userId, page, perPage } = query

    const qb = this.logRepo.createQueryBuilder('log')
      .leftJoinAndSelect('log.caller', 'caller')
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)

    if (userId !== undefined) {
      qb.where('log.callerId = :userId', { userId })
    }

    const [items, total] = await qb.getManyAndCount()

    return { items, total, page, perPage }
  }
}
