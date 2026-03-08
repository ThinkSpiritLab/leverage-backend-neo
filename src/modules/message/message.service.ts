import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Message } from '../../database/entities/message.entity';
import { User } from '../../database/entities/user.entity';
import { QueryMessageDto } from './dto/query-message.dto';

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 获取当前用户的收件箱（根消息列表，分页）
   */
  async listInboxForUser(
    userId: number,
    query: QueryMessageDto,
  ): Promise<{ items: Message[]; total: number }> {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 10, 100);

    const qb = this.messageRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .leftJoinAndSelect('m.receiver', 'receiver')
      .where(
        '(m.receiverId = :userId OR (m.senderId = :userId AND m.sessionId IS NULL))',
        { userId },
      )
      .andWhere('m.deleted = false')
      .andWhere('m.sessionId IS NULL');

    if (query.filter === 'read') {
      qb.andWhere('m.read = true');
    } else if (query.filter === 'unread') {
      qb.andWhere('m.read = false');
    }

    qb.orderBy('m.messageUpdatedAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * 获取未读消息数
   */
  async getUnreadCount(userId: number): Promise<{ count: number }> {
    const count = await this.messageRepo.count({
      where: { receiverId: userId, deleted: false, read: false },
    });
    return { count };
  }

  /**
   * 管理员获取所有消息（根消息，分页）
   */
  async listAllForAdmin(
    query: QueryMessageDto,
  ): Promise<{ items: Message[]; total: number }> {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 10, 100);

    const [items, total] = await this.messageRepo.findAndCount({
      where: { deleted: false, sessionId: IsNull() },
      relations: ['sender', 'receiver'],
      order: { messageUpdatedAt: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return { items, total };
  }

  /**
   * 获取单条消息（含回复列表）
   */
  async getOne(sessionId: number): Promise<Message[]> {
    const session = await this.messageRepo.findOne({
      where: { id: sessionId },
      relations: ['sender', 'receiver'],
    });
    if (!session) throw new NotFoundException(`消息 #${sessionId} 不存在`);
    if (session.sessionId !== null) {
      throw new BadRequestException('传入的 id 不是根消息');
    }

    const replies = await this.messageRepo.find({
      where: { sessionId },
      relations: ['sender', 'receiver'],
      order: { id: 'DESC' },
      take: 30,
    });
    return [...replies, session];
  }

  /**
   * 更新消息状态（已读/未读/关闭/删除）
   */
  async updateStatus(
    messageId: number,
    status: 'read' | 'unread' | 'closed' | 'deleted',
  ): Promise<void> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException(`消息 #${messageId} 不存在`);

    switch (status) {
      case 'read':
        message.read = true;
        break;
      case 'unread':
        message.read = false;
        break;
      case 'closed':
        message.closed = true;
        break;
      case 'deleted':
        message.deleted = true;
        break;
    }
    await this.messageRepo.save(message);
  }

  /**
   * 联系管理员（给所有 admin/sa 用户发消息）
   */
  async contactAdmin(senderId: number, content: string): Promise<Message[]> {
    const admins = await this.userRepo.find({
      where: { authority: In(['admin', 'sa', 'superadmin']) },
      select: ['id'],
    });

    if (admins.length === 0) {
      // Fallback: 发给 id=1 的用户
      return [await this.send(senderId, 1, content, null)];
    }

    return Promise.all(
      admins.map((admin) => this.send(senderId, admin.id, content, null)),
    );
  }

  /**
   * 回复消息
   */
  async reply(
    sessionId: number,
    senderId: number,
    content: string,
  ): Promise<Message> {
    const session = await this.messageRepo.findOne({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException(`消息 #${sessionId} 不存在`);
    if (session.sessionId !== null) {
      throw new BadRequestException('传入的 id 不是根消息');
    }

    // 确定回复接收方
    const receiverId =
      senderId === session.senderId ? session.receiverId : session.senderId;

    return this.send(senderId, receiverId, content, sessionId);
  }

  /**
   * 标记会话为已读
   */
  async setRead(userId: number, sessionId: number): Promise<void> {
    await this.messageRepo.update(
      { sessionId, receiverId: userId },
      { read: true },
    );
    await this.messageRepo.update(
      { id: sessionId, receiverId: userId },
      { read: true },
    );
  }

  /**
   * 发送消息
   */
  async send(
    senderId: number,
    receiverId: number | null,
    content: string,
    sessionId: number | null,
  ): Promise<Message> {
    if (receiverId === null && sessionId === null) {
      throw new BadRequestException('receiverId 不能为空');
    }

    // 更新根消息的 messageUpdatedAt
    if (sessionId !== null) {
      await this.messageRepo.update(sessionId, {
        messageUpdatedAt: new Date(),
      });
    }

    const message = this.messageRepo.create({
      senderId,
      receiverId,
      content,
      sessionId,
      read: false,
      closed: false,
      deleted: false,
      messageUpdatedAt: new Date(),
    });
    return this.messageRepo.save(message);
  }
}
