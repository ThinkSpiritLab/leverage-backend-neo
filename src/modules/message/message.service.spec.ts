import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Message } from '../../database/entities/message.entity'
import { User } from '../../database/entities/user.entity'
import { MessageService } from './message.service'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const makeQb = (overrides: Record<string, any> = {}) => {
  const qb: any = {
    createQueryBuilder: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    ...overrides,
  }
  return qb
}

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
})

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const userFixture = (id: number, authority = 'user'): Partial<User> => ({
  id,
  username: `user${id}`,
  authority,
})

const messageFixture = (overrides: Partial<Message> = {}): Partial<Message> => ({
  id: 1,
  senderId: 10,
  receiverId: 20,
  sessionId: null,
  content: 'Hello',
  read: false,
  closed: false,
  deleted: false,
  messageUpdatedAt: new Date(),
  createdAt: new Date(),
  ...overrides,
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MessageService', () => {
  let service: MessageService
  let messageRepo: ReturnType<typeof mockRepo>
  let userRepo: ReturnType<typeof mockRepo>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageService,
        { provide: getRepositoryToken(Message), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
      ],
    }).compile()

    service = module.get<MessageService>(MessageService)
    messageRepo = module.get(getRepositoryToken(Message))
    userRepo = module.get(getRepositoryToken(User))
  })

  it('service should be defined', () => {
    expect(service).toBeDefined()
  })

  // ─── listInboxForUser ───────────────────────────────────────────────────────

  describe('listInboxForUser', () => {
    it('返回收件箱列表（默认分页）', async () => {
      const msgs = [messageFixture()]
      const qb = makeQb({ getManyAndCount: jest.fn().mockResolvedValue([msgs, 1]) })
      messageRepo.createQueryBuilder.mockReturnValue(qb)

      const result = await service.listInboxForUser(20, { page: 1, perPage: 10 })

      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('分页参数正确传递', async () => {
      const qb = makeQb()
      messageRepo.createQueryBuilder.mockReturnValue(qb)

      await service.listInboxForUser(20, { page: 2, perPage: 5 })

      expect(qb.skip).toHaveBeenCalledWith(5)
      expect(qb.take).toHaveBeenCalledWith(5)
    })

    it('filter=read 时添加已读过滤', async () => {
      const qb = makeQb()
      messageRepo.createQueryBuilder.mockReturnValue(qb)

      await service.listInboxForUser(20, { filter: 'read' })

      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('m.read = true'))
    })

    it('filter=unread 时添加未读过滤', async () => {
      const qb = makeQb()
      messageRepo.createQueryBuilder.mockReturnValue(qb)

      await service.listInboxForUser(20, { filter: 'unread' })

      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('m.read = false'))
    })

    it('无 filter 时不添加额外过滤', async () => {
      const qb = makeQb()
      messageRepo.createQueryBuilder.mockReturnValue(qb)

      await service.listInboxForUser(20, {})

      const calls: string[] = (qb.andWhere as jest.Mock).mock.calls.map((c: any[]) => c[0] as string)
      const hasReadFilter = calls.some((c) => c.includes('m.read'))
      expect(hasReadFilter).toBe(false)
    })
  })

  // ─── getUnreadCount ────────────────────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('返回未读消息数', async () => {
      messageRepo.count.mockResolvedValue(3)

      const result = await service.getUnreadCount(20)

      expect(result).toEqual({ count: 3 })
      expect(messageRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ receiverId: 20, read: false }) }),
      )
    })

    it('没有未读消息时返回 0', async () => {
      messageRepo.count.mockResolvedValue(0)

      const result = await service.getUnreadCount(20)

      expect(result.count).toBe(0)
    })
  })

  // ─── updateStatus (标记已读) ────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('标记为已读', async () => {
      const msg = messageFixture({ read: false })
      messageRepo.findOne.mockResolvedValue(msg)
      messageRepo.save.mockResolvedValue({ ...msg, read: true })

      await service.updateStatus(1, 'read')

      expect(messageRepo.save).toHaveBeenCalledWith(expect.objectContaining({ read: true }))
    })

    it('标记为未读', async () => {
      const msg = messageFixture({ read: true })
      messageRepo.findOne.mockResolvedValue(msg)
      messageRepo.save.mockResolvedValue({ ...msg, read: false })

      await service.updateStatus(1, 'unread')

      expect(messageRepo.save).toHaveBeenCalledWith(expect.objectContaining({ read: false }))
    })

    it('标记为关闭', async () => {
      const msg = messageFixture({ closed: false })
      messageRepo.findOne.mockResolvedValue(msg)
      messageRepo.save.mockResolvedValue({ ...msg, closed: true })

      await service.updateStatus(1, 'closed')

      expect(messageRepo.save).toHaveBeenCalledWith(expect.objectContaining({ closed: true }))
    })

    it('消息不存在时抛 NotFoundException', async () => {
      messageRepo.findOne.mockResolvedValue(null)

      await expect(service.updateStatus(999, 'read')).rejects.toThrow(NotFoundException)
    })
  })

  // ─── setRead ───────────────────────────────────────────────────────────────

  describe('setRead', () => {
    it('标记会话为已读', async () => {
      messageRepo.update.mockResolvedValue({ affected: 1 })

      await service.setRead(20, 1)

      expect(messageRepo.update).toHaveBeenCalledTimes(2)
      expect(messageRepo.update).toHaveBeenCalledWith(
        { sessionId: 1, receiverId: 20 },
        { read: true },
      )
      expect(messageRepo.update).toHaveBeenCalledWith(
        { id: 1, receiverId: 20 },
        { read: true },
      )
    })
  })

  // ─── contactAdmin ──────────────────────────────────────────────────────────

  describe('contactAdmin', () => {
    it('给所有 admin 用户发消息', async () => {
      const admins = [userFixture(1, 'admin'), userFixture(2, 'sa')]
      userRepo.find.mockResolvedValue(admins)
      const savedMsg = messageFixture()
      messageRepo.update.mockResolvedValue({})
      messageRepo.create.mockReturnValue(savedMsg)
      messageRepo.save.mockResolvedValue(savedMsg)

      const result = await service.contactAdmin(10, 'Help!')

      expect(userRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ authority: expect.anything() }) }),
      )
      expect(messageRepo.save).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(2)
    })

    it('没有 admin 时 fallback 发给 id=1 的用户', async () => {
      userRepo.find.mockResolvedValue([])
      const savedMsg = messageFixture()
      messageRepo.update.mockResolvedValue({})
      messageRepo.create.mockReturnValue(savedMsg)
      messageRepo.save.mockResolvedValue(savedMsg)

      const result = await service.contactAdmin(10, 'Help!')

      expect(messageRepo.save).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
    })
  })

  // ─── reply ─────────────────────────────────────────────────────────────────

  describe('reply', () => {
    it('回复消息（发送方是原始发送者）', async () => {
      const session = messageFixture({ id: 1, senderId: 10, receiverId: 20, sessionId: null })
      messageRepo.findOne.mockResolvedValue(session)
      messageRepo.update.mockResolvedValue({})
      const reply = messageFixture({ id: 2, senderId: 10, receiverId: 20, sessionId: 1 })
      messageRepo.create.mockReturnValue(reply)
      messageRepo.save.mockResolvedValue(reply)

      const result = await service.reply(1, 10, 'Reply content')

      expect(messageRepo.save).toHaveBeenCalled()
      expect(result.sessionId).toBe(1)
    })

    it('回复消息（发送方是原始接收者）', async () => {
      const session = messageFixture({ id: 1, senderId: 10, receiverId: 20, sessionId: null })
      messageRepo.findOne.mockResolvedValue(session)
      messageRepo.update.mockResolvedValue({})
      const reply = messageFixture({ id: 2, senderId: 20, receiverId: 10, sessionId: 1 })
      messageRepo.create.mockReturnValue(reply)
      messageRepo.save.mockResolvedValue(reply)

      const result = await service.reply(1, 20, 'Reply from receiver')

      expect(messageRepo.save).toHaveBeenCalled()
      expect(result).toBeDefined()
    })

    it('消息不存在时抛 NotFoundException', async () => {
      messageRepo.findOne.mockResolvedValue(null)

      await expect(service.reply(999, 10, 'content')).rejects.toThrow(NotFoundException)
    })

    it('传入非根消息 id 时抛 BadRequestException', async () => {
      const nonRoot = messageFixture({ sessionId: 1 })
      messageRepo.findOne.mockResolvedValue(nonRoot)

      await expect(service.reply(2, 10, 'content')).rejects.toThrow(BadRequestException)
    })
  })

  // ─── getOne ────────────────────────────────────────────────────────────────

  describe('getOne', () => {
    it('返回根消息及其回复列表', async () => {
      const session = messageFixture({ id: 1, sessionId: null })
      const replies = [
        messageFixture({ id: 2, sessionId: 1 }),
        messageFixture({ id: 3, sessionId: 1 }),
      ]
      messageRepo.findOne.mockResolvedValue(session)
      messageRepo.find.mockResolvedValue(replies)

      const result = await service.getOne(1)

      expect(result).toHaveLength(3) // 2 replies + root
    })

    it('消息不存在时抛 NotFoundException', async () => {
      messageRepo.findOne.mockResolvedValue(null)

      await expect(service.getOne(999)).rejects.toThrow(NotFoundException)
    })

    it('传入非根消息 id 时抛 BadRequestException', async () => {
      const nonRoot = messageFixture({ sessionId: 1 })
      messageRepo.findOne.mockResolvedValue(nonRoot)

      await expect(service.getOne(2)).rejects.toThrow(BadRequestException)
    })
  })
})
