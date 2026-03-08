import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '../../database/entities/user.entity'
import { RedisService } from '../redis/redis.service'
import { hashPassword, verifyPassword } from '../../common/utils/crypto.util'
import { UserService } from './user.service'

const mockUserRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
})

const mockRedisService = () => ({
  hget: jest.fn(),
  hset: jest.fn(),
})

describe('UserService', () => {
  let service: UserService
  let userRepo: jest.Mocked<Repository<User>>

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: RedisService, useFactory: mockRedisService },
      ],
    }).compile()

    service = module.get<UserService>(UserService)
    userRepo = module.get(getRepositoryToken(User))
  })

  // ─── canManage 权限测试 ─────────────────────────────────────────────────────

  describe('canManage', () => {
    it('admin 可以管理 user', () => {
      expect(service.canManage('admin', 'user')).toBe(true)
    })

    it('admin 可以管理 supervisor', () => {
      expect(service.canManage('admin', 'supervisor')).toBe(true)
    })

    it('admin 可以管理 contest-user', () => {
      expect(service.canManage('admin', 'contest-user')).toBe(true)
    })

    it('user 不能管理 admin', () => {
      expect(service.canManage('user', 'admin')).toBe(false)
    })

    it('user 不能管理 supervisor', () => {
      expect(service.canManage('user', 'supervisor')).toBe(false)
    })

    it('不能管理同级用户（user 不能管 user）', () => {
      expect(service.canManage('user', 'user')).toBe(false)
    })

    it('不能管理同级用户（admin 不能管 admin）', () => {
      expect(service.canManage('admin', 'admin')).toBe(false)
    })

    it('admin 不能任命/管理 sa', () => {
      expect(service.canManage('admin', 'sa')).toBe(false)
    })

    it('supervisor 不能管理 user', () => {
      expect(service.canManage('supervisor', 'user')).toBe(false)
    })

    it('sa 可以管理 admin', () => {
      expect(service.canManage('sa', 'admin')).toBe(true)
    })

    it('sa 可以管理所有人', () => {
      expect(service.canManage('sa', 'user')).toBe(true)
      expect(service.canManage('sa', 'supervisor')).toBe(true)
      expect(service.canManage('sa', 'contest-user')).toBe(true)
    })
  })

  // ─── create 密码哈希测试 ────────────────────────────────────────────────────

  describe('create', () => {
    it('密码被正确 hash（不存明文）', async () => {
      userRepo.findOne.mockResolvedValue(null)

      let savedUser: any
      userRepo.create.mockImplementation((data: any) => data as any)
      userRepo.save.mockImplementation(async (user: any) => {
        savedUser = user
        return { ...user, id: 1 } as any
      })

      await service.create({
        username: 'testuser',
        password: 'plainpassword123',
      })

      expect(savedUser).toBeDefined()
      expect(savedUser.passwordHash).toBeDefined()
      expect(savedUser.passwordHash).not.toBe('plainpassword123')
      expect(savedUser.passwordHash).toMatch(/^pbkdf2:/)
      // 验证 hash 可以被正确验证
      expect(verifyPassword('plainpassword123', savedUser.passwordHash)).toBe(true)
    })

    it('用户名已存在时抛 ConflictException', async () => {
      userRepo.findOne.mockResolvedValue({ id: 1, username: 'existinguser' } as any)

      await expect(
        service.create({ username: 'existinguser', password: 'password' }),
      ).rejects.toThrow(ConflictException)
    })
  })

  // ─── changePassword 测试 ────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('旧密码错误抛 UnauthorizedException', async () => {
      const correctHash = hashPassword('correctpassword')
      userRepo.findOne.mockResolvedValue({
        id: 1,
        username: 'testuser',
        passwordHash: correctHash,
      } as any)

      await expect(
        service.changePassword(1, { oldPassword: 'wrongpassword', newPassword: 'newpassword123' }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('旧密码正确时成功修改', async () => {
      const correctHash = hashPassword('correctpassword')
      const user: any = { id: 1, username: 'testuser', passwordHash: correctHash }
      userRepo.findOne.mockResolvedValue(user)
      userRepo.save.mockResolvedValue(user)

      await service.changePassword(1, { oldPassword: 'correctpassword', newPassword: 'newpassword123' })

      expect(userRepo.save).toHaveBeenCalled()
      const savedUser = userRepo.save.mock.calls[0][0] as any
      expect(savedUser.passwordHash).not.toBe(correctHash)
      expect(verifyPassword('newpassword123', savedUser.passwordHash)).toBe(true)
    })

    it('用户不存在时抛 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null)

      await expect(
        service.changePassword(999, { oldPassword: 'password', newPassword: 'newpassword' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // ─── importUsers 测试 ───────────────────────────────────────────────────────

  describe('importUsers', () => {
    it('返回 success/failed 统计', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null) // 第一个用户不存在
        .mockResolvedValueOnce({ id: 2, username: 'existinguser' } as any) // 第二个用户已存在
        .mockResolvedValueOnce(null) // 第三个用户不存在

      userRepo.create.mockImplementation((data: any) => data as any)
      userRepo.save.mockResolvedValue({ id: 3 } as any)

      const result = await service.importUsers([
        { username: 'user1', password: 'pass1' },
        { username: 'existinguser', password: 'pass2' },
        { username: 'user3', password: 'pass3' },
      ])

      expect(result.success).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('existinguser')
    })

    it('用户名未定义时计入 failed', async () => {
      const result = await service.importUsers([{ username: '' } as any])
      expect(result.failed).toBe(1)
      expect(result.success).toBe(0)
    })
  })
})
