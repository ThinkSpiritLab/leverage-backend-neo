import { createHash } from 'crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';

import { ApiKeyService } from './api-key.service';
import { UserApiKey } from '../../database/entities/user-api-key.entity';
import { User } from '../../database/entities/user.entity';

const mockApiKeyRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
};

const mockUserRepo = {
  findOne: jest.fn(),
};

const mockUser = { id: 1, username: 'alice', authority: 'user' };
const mockKey = {
  id: 10,
  userId: 1,
  name: 'test-key',
  keyPrefix: 'lev_abcd123456',
  keyHash: 'deadbeef',
  createdAt: new Date('2026-01-01'),
  lastUsedAt: null,
  revokedAt: null,
};

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: getRepositoryToken(UserApiKey), useValue: mockApiKeyRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();
    service = module.get<ApiKeyService>(ApiKeyService);
  });

  // ── createApiKey ─────────────────────────────────────────────────────────────

  describe('createApiKey', () => {
    it('生成 lev_ 前缀的密钥并存储 sha256 哈希', async () => {
      // save 返回 create 的入参（模拟 TypeORM save 行为）
      mockApiKeyRepo.create.mockImplementation((v) => v);
      mockApiKeyRepo.save.mockImplementation(async (v) => ({ ...v, id: 10, createdAt: new Date() }));

      const result = await service.createApiKey(1, 'test-key');

      expect(result.key).toMatch(/^lev_[0-9a-f]{48}$/);
      expect(result.name).toBe('test-key');

      const createArg = mockApiKeyRepo.create.mock.calls[0][0];
      const expectedHash = createHash('sha256').update(result.key).digest('hex');
      expect(createArg.keyHash).toBe(expectedHash);
      expect(createArg.keyPrefix).toBe(result.key.slice(0, 12));
    });

    it('明文密钥仅在返回值中出现一次，不存储', async () => {
      mockApiKeyRepo.create.mockReturnValue(mockKey);
      mockApiKeyRepo.save.mockResolvedValue(mockKey);

      const result = await service.createApiKey(1, 'k');

      // Stored hash ≠ raw key
      const savedHash = mockApiKeyRepo.create.mock.calls[0][0].keyHash;
      expect(savedHash).not.toBe(result.key);
      expect(savedHash).toHaveLength(64); // sha256 hex
    });
  });

  // ── validateApiKey ────────────────────────────────────────────────────────────

  describe('validateApiKey', () => {
    it('有效 key 返回用户 payload', async () => {
      mockApiKeyRepo.findOne.mockResolvedValue(mockKey);
      mockUserRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.validateApiKey('lev_testkey');

      expect(result).toEqual({ sub: 1, username: 'alice', role: 'user' });
      expect(mockApiKeyRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: IsNull() }),
        }),
      );
    });

    it('key 不存在返回 null', async () => {
      mockApiKeyRepo.findOne.mockResolvedValue(null);
      expect(await service.validateApiKey('bad_key')).toBeNull();
    });

    it('user 不存在返回 null', async () => {
      mockApiKeyRepo.findOne.mockResolvedValue(mockKey);
      mockUserRepo.findOne.mockResolvedValue(null);
      expect(await service.validateApiKey('lev_test')).toBeNull();
    });
  });

  // ── listApiKeys ───────────────────────────────────────────────────────────────

  describe('listApiKeys', () => {
    it('返回用户的 key 列表，包含正确字段', async () => {
      const { keyHash: _kh, ...keyWithoutHash } = mockKey;
      mockApiKeyRepo.find.mockResolvedValue([keyWithoutHash]);
      const result = await service.listApiKeys(1);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(10);
      expect(result[0].name).toBe('test-key');
    });
  });

  // ── revokeApiKey ──────────────────────────────────────────────────────────────

  describe('revokeApiKey', () => {
    it('成功撤销', async () => {
      mockApiKeyRepo.findOne.mockResolvedValue(mockKey);
      mockApiKeyRepo.update.mockResolvedValue({});

      await service.revokeApiKey(1, 10);

      expect(mockApiKeyRepo.update).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('key 不存在抛 NotFoundException', async () => {
      mockApiKeyRepo.findOne.mockResolvedValue(null);
      await expect(service.revokeApiKey(1, 99)).rejects.toThrow(NotFoundException);
    });

    it('非拥有者抛 ForbiddenException', async () => {
      mockApiKeyRepo.findOne.mockResolvedValue({ ...mockKey, userId: 999 });
      await expect(service.revokeApiKey(1, 10)).rejects.toThrow(ForbiddenException);
    });
  });
});
