import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Notification } from '../../database/entities/notification.entity'
import { CreateNotificationDto } from './dto/create-notification.dto'

export interface NotificationQuery {
  page?: number
  perPage?: number
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  /**
   * 获取通知列表（分页，不含已删除）
   */
  async findAll(query: NotificationQuery): Promise<{ items: Notification[]; total: number }> {
    const page = query.page ?? 1
    const perPage = Math.min(query.perPage ?? 10, 100)

    const [items, total] = await this.notificationRepo.findAndCount({
      where: { deleted: false },
      order: { highlight: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    })

    return { items, total }
  }

  /**
   * 创建通知（admin+）
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepo.create({
      title: dto.title,
      content: dto.content,
      highlight: dto.highlight ?? false,
    })
    return this.notificationRepo.save(notification)
  }

  /**
   * 标记已读（此实体无 readBy 字段，简化处理，仅确认存在）
   * 注：原始 Notification 实体不含 readBy，此处仅做存在性检查
   */
  async markRead(id: number, _userId: number): Promise<void> {
    const notification = await this.notificationRepo.findOne({ where: { id } })
    if (!notification) {
      throw new NotFoundException(`通知 #${id} 不存在`)
    }
    // 原始 schema 不含 readBy，简化为 no-op（返回 200 表示成功）
  }

  /**
   * 获取未读数（返回所有未删除的通知数，因 schema 不含 readBy）
   */
  async getUnreadCount(_userId: number): Promise<{ count: number }> {
    const count = await this.notificationRepo.count({ where: { deleted: false } })
    return { count }
  }
}
