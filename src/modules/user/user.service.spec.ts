import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { RedisService } from '../redis/redis.service';
import { hashPassword, verifyPassword } from '../../common/utils/crypto.util';
import { UserService } from './user.service';

const mockUserRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockRedisService = () => ({
  hget: jest.fn(),
  hset: jest.fn(),
});

describe('UserService', () => {
  let service: UserService;
  let userRepo: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: RedisService, useFactory: mockRedisService },
        {
          provide: DataSource,
          useValue: { query: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    userRepo = module.get(getRepositoryToken(User));
  });

  // ─── canManage 权限测试 ─────────────────────────────────────────────────────

  describe('canManage', () => {
    it('admin 可以管理 user', () => {
      expect(service.canManage('admin', 'user')).toBe(true);
    });

    it('admin 可以管理 supervisor', () => {
      expect(service.canManage('admin', 'supervisor')).toBe(true);
    });

    it('admin 可以管理 contest-user', () => {
      expect(service.canManage('admin', 'contest-user')).toBe(true);
    });

    it('user 不能管理 admin', () => {
      expect(service.canManage('user', 'admin')).toBe(false);
    });

    it('user 不能管理 supervisor', () => {
      expect(service.canManage('user', 'supervisor')).toBe(false);
    });

    it('不能管理同级用户（user 不能管 user）', () => {
      expect(service.canManage('user', 'user')).toBe(false);
    });

    it('不能管理同级用户（admin 不能管 admin）', () => {
      expect(service.canManage('admin', 'admin')).toBe(false);
    });

    it('admin 不能任命/管理 sa', () => {
      expect(service.canManage('admin', 'sa')).toBe(false);
    });

    it('supervisor 不能管理 user', () => {
      expect(service.canManage('supervisor', 'user')).toBe(false);
    });

    it('sa 可以管理 admin', () => {
      expect(service.canManage('sa', 'admin')).toBe(true);
    });

    it('sa 可以管理所有人', () => {
      expect(service.canManage('sa', 'user')).toBe(true);
      expect(service.canManage('sa', 'supervisor')).toBe(true);
      expect(service.canManage('sa', 'contest-user')).toBe(true);
    });
  });

  // ─── create 密码哈希测试 ────────────────────────────────────────────────────

  describe('create', () => {
    it('密码被正确 hash（不存明文）', async () => {
      userRepo.findOne.mockResolvedValue(null);

      let savedUser: any;
      userRepo.create.mockImplementation((data: any) => data);
      userRepo.save.mockImplementation(async (user: any) => {
        savedUser = user;
        return { ...user, id: 1 };
      });

      await service.create({
        username: 'testuser',
        password: 'plainpassword123',
      });

      expect(savedUser).toBeDefined();
      expect(savedUser.passwordHash).toBeDefined();
      expect(savedUser.passwordHash).not.toBe('plainpassword123');
      expect(savedUser.passwordHash).toMatch(/^pbkdf2:/);
      // 验证 hash 可以被正确验证
      expect(verifyPassword('plainpassword123', savedUser.passwordHash)).toBe(
        true,
      );
    });

    it('用户名已存在时抛 ConflictException', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 1,
        username: 'existinguser',
      } as any);

      await expect(
        service.create({ username: 'existinguser', password: 'password' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── changePassword 测试 ────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('旧密码错误抛 UnauthorizedException', async () => {
      const correctHash = hashPassword('correctpassword');
      userRepo.findOne.mockResolvedValue({
        id: 1,
        username: 'testuser',
        passwordHash: correctHash,
      } as any);

      await expect(
        service.changePassword(1, {
          oldPassword: 'wrongpassword',
          newPassword: 'newpassword123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('旧密码正确时成功修改', async () => {
      const correctHash = hashPassword('correctpassword');
      const user: any = {
        id: 1,
        username: 'testuser',
        passwordHash: correctHash,
      };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue(user);

      await service.changePassword(1, {
        oldPassword: 'correctpassword',
        newPassword: 'newpassword123',
      });

      expect(userRepo.save).toHaveBeenCalled();
      const savedUser = userRepo.save.mock.calls[0][0] as any;
      expect(savedUser.passwordHash).not.toBe(correctHash);
      expect(verifyPassword('newpassword123', savedUser.passwordHash)).toBe(
        true,
      );
    });

    it('用户不存在时抛 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.changePassword(999, {
          oldPassword: 'password',
          newPassword: 'newpassword',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── importUsers 测试 ───────────────────────────────────────────────────────

  describe('importUsers', () => {
    it('返回 success/failed 统计', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null) // 第一个用户不存在
        .mockResolvedValueOnce({ id: 2, username: 'existinguser' } as any) // 第二个用户已存在
        .mockResolvedValueOnce(null); // 第三个用户不存在

      userRepo.create.mockImplementation((data: any) => data);
      userRepo.save.mockResolvedValue({ id: 3 } as any);

      const result = await service.importUsers([
        { username: 'user1', password: 'pass1' },
        { username: 'existinguser', password: 'pass2' },
        { username: 'user3', password: 'pass3' },
      ]);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('existinguser');
    });

    it('用户名未定义时计入 failed', async () => {
      const result = await service.importUsers([{ username: '' } as any]);
      expect(result.failed).toBe(1);
      expect(result.success).toBe(0);
    });
  });

  // ─── findAll 搜索过滤、分页 ─────────────────────────────────────────────

  describe('findAll', () => {
    let mockQb: any;

    beforeEach(() => {
      mockQb = {
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQb);
    });

    it('应该正确计算分页偏移：page=2, perPage=10 → skip=10', async () => {
      await service.findAll({ page: 2, perPage: 10 });
      expect(mockQb.skip).toHaveBeenCalledWith(10);
      expect(mockQb.take).toHaveBeenCalledWith(10);
    });

    it('传入 search 时应该添加 LIKE 过滤', async () => {
      await service.findAll({ page: 1, perPage: 20, search: 'alice' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LIKE'),
        { search: '%alice%' },
      );
    });

    it('传入 role 时应该过滤 authority', async () => {
      await service.findAll({ page: 1, perPage: 20, role: 'admin' });
      expect(mockQb.andWhere).toHaveBeenCalledWith('u.authority = :authority', {
        authority: 'admin',
      });
    });

    it('role=sa 应该映射为 superadmin', async () => {
      await service.findAll({ page: 1, perPage: 20, role: 'sa' });
      expect(mockQb.andWhere).toHaveBeenCalledWith('u.authority = :authority', {
        authority: 'superadmin',
      });
    });

    it('返回 items 和 total', async () => {
      const mockUser = { id: 1, username: 'alice' } as any;
      mockQb.getManyAndCount.mockResolvedValue([[mockUser], 1]);

      const result = await service.findAll({ page: 1, perPage: 20 });
      expect(result.items).toEqual([mockUser]);
      expect(result.total).toBe(1);
    });
  });

  // ─── update 权限校验 ────────────────────────────────────────────────────

  describe('update', () => {
    it('admin 可以更新 user', async () => {
      const user: any = { id: 10, username: 'user1', authority: 'user' };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: any) => u);

      const result = await service.update(
        10,
        { username: 'user1_updated' },
        'admin',
      );
      expect(result.username).toBe('user1_updated');
    });

    it('user 不能更新 admin（ForbiddenException）', async () => {
      const adminUser: any = { id: 5, username: 'admin1', authority: 'admin' };
      userRepo.findOne.mockResolvedValue(adminUser);

      await expect(
        service.update(5, { username: 'hacked' }, 'user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('admin 不能直接任命 sa（ForbiddenException）', async () => {
      const user: any = { id: 10, username: 'user1', authority: 'user' };
      userRepo.findOne.mockResolvedValue(user);

      await expect(service.update(10, { role: 'sa' }, 'admin')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('目标用户不存在时应该抛出 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(999, { username: 'x' }, 'admin'),
      ).rejects.toThrow(NotFoundException);
    });

    it('应该更新密码（hash 存储）', async () => {
      const user: any = {
        id: 10,
        username: 'user1',
        authority: 'user',
        passwordHash: 'old',
      };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: any) => u);

      await service.update(10, { password: 'newpassword123' }, 'admin');

      expect(user.passwordHash).not.toBe('old');
      expect(user.passwordHash).toMatch(/^pbkdf2:/);
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('应该删除存在的用户', async () => {
      const user: any = { id: 1, username: 'user1' };
      userRepo.findOne.mockResolvedValue(user);

      await service.remove(1);

      expect(userRepo.remove).toHaveBeenCalledWith(user);
    });

    it('用户不存在时应该抛出 NotFoundException', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update - 字段分支覆盖（lines 123-126） ────────────────────────────────

  describe('update - 字段赋值分支', () => {
    it('传入所有可选字段时应全部更新', async () => {
      const user: any = {
        id: 10,
        username: 'user1',
        authority: 'user',
        passwordHash: 'old',
        nickname: null,
        sex: 'unknown',
        certifiedName: null,
        grade: null,
        college: null,
        profession: null,
        class: null,
      };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: any) => u);

      await service.update(
        10,
        {
          username: 'new_username',
          nickname: 'Nick',
          sex: 'male',
          certifiedName: 'Real Name',
          grade: '2024',
          college: 'CS',
          profession: 'Software',
          class: 'Class A',
        },
        'admin',
      );

      expect(user.username).toBe('new_username');
      expect(user.nickname).toBe('Nick');
      expect(user.sex).toBe('male');
      expect(user.certifiedName).toBe('Real Name');
      expect(user.grade).toBe('2024');
      expect(user.college).toBe('CS');
      expect(user.profession).toBe('Software');
      expect(user.class).toBe('Class A');
    });

    it('nickname=null 时应存为 null', async () => {
      const user: any = {
        id: 10,
        username: 'user1',
        authority: 'user',
        nickname: 'old',
      };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: any) => u);

      await service.update(10, { nickname: null }, 'admin');

      expect(user.nickname).toBeNull();
    });

    it('certifiedName=null 时应存为 null', async () => {
      const user: any = {
        id: 10,
        username: 'user1',
        authority: 'user',
        certifiedName: 'old',
      };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: any) => u);

      await service.update(10, { certifiedName: null }, 'admin');

      expect(user.certifiedName).toBeNull();
    });

    it('不传 role 时不应修改 authority', async () => {
      const user: any = { id: 10, username: 'user1', authority: 'user' };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: any) => u);

      await service.update(10, { username: 'updated' }, 'admin');

      expect(user.authority).toBe('user'); // unchanged
    });

    it('admin 可以将 user 升级为 supervisor', async () => {
      const user: any = { id: 10, username: 'user1', authority: 'user' };
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u: any) => u);

      await service.update(10, { role: 'supervisor' }, 'sa');

      expect(user.authority).toBe('supervisor');
    });
  });

  // ─── getUserProblemStatus（lines 236-251） ────────────────────────────────

  describe('getUserProblemStatus', () => {
    let redisService: jest.Mocked<RedisService>;

    beforeEach(() => {
      redisService = (service as any).redisService;
    });

    it('problemIds 为空时应返回空 Map', async () => {
      const result = await service.getUserProblemStatus(1, []);
      expect(result.size).toBe(0);
    });

    it('val 存在时应添加到结果 Map', async () => {
      redisService.hget.mockResolvedValue('2');
      const result = await service.getUserProblemStatus(1, [100]);
      expect(result.get(100)).toBe(2);
    });

    it('val 为 null 时不应添加到结果 Map（覆盖 null 分支）', async () => {
      redisService.hget.mockResolvedValue(null);
      const result = await service.getUserProblemStatus(1, [100]);
      expect(result.has(100)).toBe(false);
    });

    it('多个 problemId 混合时只添加有值的', async () => {
      redisService.hget
        .mockResolvedValueOnce('1') // problemId=1 → has value
        .mockResolvedValueOnce(null) // problemId=2 → null
        .mockResolvedValueOnce('2'); // problemId=3 → has value

      const result = await service.getUserProblemStatus(1, [1, 2, 3]);
      expect(result.get(1)).toBe(1);
      expect(result.has(2)).toBe(false);
      expect(result.get(3)).toBe(2);
    });
  });

  // ─── findAll - college/profession/grade 过滤分支 ─────────────────────────

  describe('findAll - 额外过滤字段', () => {
    let mockQb: any;

    beforeEach(() => {
      mockQb = {
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQb);
    });

    it('传入 college 时应过滤', async () => {
      await service.findAll({ college: 'CS' });
      expect(mockQb.andWhere).toHaveBeenCalledWith('u.college = :college', {
        college: 'CS',
      });
    });

    it('传入 profession 时应过滤', async () => {
      await service.findAll({ profession: 'Software' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'u.profession = :profession',
        { profession: 'Software' },
      );
    });

    it('传入 grade 时应过滤', async () => {
      await service.findAll({ grade: '2024' });
      expect(mockQb.andWhere).toHaveBeenCalledWith('u.grade = :grade', {
        grade: '2024',
      });
    });
  });
});
