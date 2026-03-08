/**
 * user.integration.spec.ts
 *
 * Integration tests for UserService using:
 * - SQLite in-memory (via better-sqlite3 + TypeORM)
 * - ioredis-mock for RedisService
 */
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { UserService } from '../../src/modules/user/user.service'
import { User } from '../../src/database/entities/user.entity'
import { RedisService } from '../../src/modules/redis/redis.service'
import { ALL_ENTITIES, patchBoolColumnsForSqlite } from './setup'
import { createMockRedisService } from './redis.mock'

// Patch 'bool' → 'integer' for SQLite compatibility
patchBoolColumnsForSqlite()

// Integration tests may take longer due to DB setup
jest.setTimeout(30000)
import { verifyPassword } from '../../src/common/utils/crypto.util'
import { ImportUserDto } from '../../src/modules/user/dto/import-users.dto'

describe('UserService (integration)', () => {
  let module: TestingModule
  let userService: UserService
  let dataSource: DataSource
  let userRepo: any

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: ALL_ENTITIES,
          synchronize: true,
          logging: false,
        } as any),
        TypeOrmModule.forFeature([User]),
      ],
      providers: [
        UserService,
        {
          provide: RedisService,
          useValue: createMockRedisService(),
        },
      ],
    }).compile()

    userService = module.get<UserService>(UserService)
    dataSource = module.get<DataSource>(DataSource)
    userRepo = dataSource.getRepository(User)
  })

  afterAll(async () => {
    await module.close()
  })

  beforeEach(async () => {
    await userRepo.clear()
  })

  describe('create user with hashed password', () => {
    it('should store hashed password (not plaintext) on user creation', async () => {
      await userService.create({
        username: 'hashtest',
        password: 'MySecretPassword',
        role: 'user',
      })

      // Fetch the raw password hash from DB
      const saved = await userRepo.findOne({
        where: { username: 'hashtest' },
        select: ['id', 'username', 'passwordHash'],
      })

      expect(saved).toBeDefined()
      expect(saved.passwordHash).not.toBe('MySecretPassword')
      expect(saved.passwordHash).toMatch(/^pbkdf2:/)
      // Verify the hash validates correctly
      expect(verifyPassword('MySecretPassword', saved.passwordHash)).toBe(true)
      expect(verifyPassword('wrong', saved.passwordHash)).toBe(false)
    })

    it('should throw ConflictException for duplicate username', async () => {
      await userService.create({ username: 'dupuser', password: 'pass', role: 'user' })

      await expect(
        userService.create({ username: 'dupuser', password: 'other', role: 'user' }),
      ).rejects.toThrow('用户名已存在')
    })
  })

  describe('importUsers', () => {
    it('should import multiple users with hashed passwords', async () => {
      const users: ImportUserDto[] = [
        { username: 'import1', password: 'pass1', certifiedName: '张三', college: '计算机学院' },
        { username: 'import2', password: 'pass2', certifiedName: '李四', grade: '2024' },
        { username: 'import3' }, // no password → defaults to 'nopassword'
      ]

      const result = await userService.importUsers(users)

      expect(result.success).toBe(3)
      expect(result.failed).toBe(0)

      // Verify passwords are hashed
      const user1 = await userRepo.findOne({
        where: { username: 'import1' },
        select: ['id', 'username', 'passwordHash'],
      })
      expect(user1.passwordHash).toMatch(/^pbkdf2:/)
      expect(verifyPassword('pass1', user1.passwordHash)).toBe(true)
    })

    it('should report failed imports without throwing', async () => {
      // Pre-create a user that will conflict
      await userService.create({ username: 'existing', password: 'pass', role: 'user' })

      const users: ImportUserDto[] = [
        { username: 'existing', password: 'new' }, // will fail: already exists
        { username: 'newuser', password: 'pass' }, // will succeed
      ]

      const result = await userService.importUsers(users)

      expect(result.success).toBe(1)
      expect(result.failed).toBe(1)
      expect(result.errors[0]).toContain('existing')
    })
  })

  describe('canManage permission weight', () => {
    it('sa should manage admin', () => {
      expect(userService.canManage('sa', 'admin')).toBe(true)
    })

    it('sa should manage supervisor', () => {
      expect(userService.canManage('sa', 'supervisor')).toBe(true)
    })

    it('sa should manage user', () => {
      expect(userService.canManage('sa', 'user')).toBe(true)
    })

    it('admin should manage supervisor', () => {
      expect(userService.canManage('admin', 'supervisor')).toBe(true)
    })

    it('admin should manage user', () => {
      expect(userService.canManage('admin', 'user')).toBe(true)
    })

    it('admin should NOT manage sa', () => {
      expect(userService.canManage('admin', 'sa')).toBe(false)
    })

    it('admin should NOT manage another admin', () => {
      expect(userService.canManage('admin', 'admin')).toBe(false)
    })

    it('supervisor should NOT manage any user (read-only)', () => {
      expect(userService.canManage('supervisor', 'user')).toBe(false)
      expect(userService.canManage('supervisor', 'supervisor')).toBe(false)
      expect(userService.canManage('supervisor', 'admin')).toBe(false)
    })

    it('user should NOT manage anyone', () => {
      expect(userService.canManage('user', 'user')).toBe(false)
      expect(userService.canManage('user', 'supervisor')).toBe(false)
    })

    it('update should enforce canManage — admin cannot update another admin', async () => {
      // Create an admin target
      await userService.create({ username: 'targetadmin', password: 'pass', role: 'admin' })
      const target = await userRepo.findOne({ where: { username: 'targetadmin' } })

      // Another admin tries to update the target admin
      await expect(
        userService.update(target.id, { nickname: 'hacked' }, 'admin'),
      ).rejects.toThrow('权限不足')
    })

    it('sa should be able to update admin', async () => {
      await userService.create({ username: 'admintarget', password: 'pass', role: 'admin' })
      const target = await userRepo.findOne({ where: { username: 'admintarget' } })

      const updated = await userService.update(target.id, { nickname: 'Updated by SA' }, 'sa')

      expect(updated.nickname).toBe('Updated by SA')
    })
  })

  describe('paginate user list with search', () => {
    beforeEach(async () => {
      // Create 15 users for pagination testing
      const users: ImportUserDto[] = Array.from({ length: 15 }, (_, i) => ({
        username: `pageuser${i + 1}`,
        password: 'pass',
        certifiedName: i < 5 ? `Search Target ${i + 1}` : `Other User ${i + 1}`,
      }))
      await userService.importUsers(users)
    })

    it('should paginate user list correctly', async () => {
      const page1 = await userService.findAll({ page: 1, perPage: 10 })
      const page2 = await userService.findAll({ page: 2, perPage: 10 })

      expect(page1.total).toBe(15)
      expect(page1.items).toHaveLength(10)
      expect(page2.items).toHaveLength(5)
    })

    it('should search users by certifiedName', async () => {
      const result = await userService.findAll({ page: 1, perPage: 20, search: 'Search Target' })

      expect(result.items.length).toBe(5)
      expect(result.items.every((u: User) => u.certifiedName?.includes('Search Target'))).toBe(true)
    })

    it('should search users by username', async () => {
      const result = await userService.findAll({ page: 1, perPage: 20, search: 'pageuser1' })

      // Should match pageuser1, pageuser10, pageuser11, pageuser12, pageuser13, pageuser14, pageuser15
      expect(result.items.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('findOne and remove', () => {
    it('should find user by id', async () => {
      const created = await userService.create({
        username: 'findme',
        password: 'pass',
        role: 'user',
      })

      const found = await userService.findOne(created.id)
      expect(found.username).toBe('findme')
    })

    it('should throw NotFoundException for non-existent user', async () => {
      await expect(userService.findOne(99999)).rejects.toThrow('不存在')
    })

    it('should remove user', async () => {
      const created = await userService.create({
        username: 'deleteme',
        password: 'pass',
        role: 'user',
      })

      await userService.remove(created.id)

      await expect(userService.findOne(created.id)).rejects.toThrow('不存在')
    })
  })
})
