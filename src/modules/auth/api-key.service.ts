import { createHash, randomBytes } from 'crypto';

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { UserApiKey } from '../../database/entities/user-api-key.entity';
import { User } from '../../database/entities/user.entity';
import { isAccountBlocked, mapAuthorityToRole } from './account-auth.util';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(UserApiKey)
    private readonly apiKeyRepo: Repository<UserApiKey>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 创建 API Key，返回完整密钥（仅此一次）
   */
  async createApiKey(
    userId: number,
    name: string,
  ): Promise<{
    id: number;
    name: string;
    keyPrefix: string;
    key: string;
    createdAt: Date;
  }> {
    const rawKey = 'lev_' + randomBytes(24).toString('hex');
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const entity = this.apiKeyRepo.create({
      userId,
      name,
      keyPrefix,
      keyHash,
    });
    const saved = await this.apiKeyRepo.save(entity);

    return {
      id: saved.id,
      name: saved.name,
      keyPrefix: saved.keyPrefix,
      key: rawKey,
      createdAt: saved.createdAt,
    };
  }

  /**
   * 验证 API Key，返回用户信息（JwtPayload 兼容格式）
   */
  async validateApiKey(
    rawKey: string,
  ): Promise<{ sub: number; username: string; role: string } | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.apiKeyRepo.findOne({
      where: { keyHash, revokedAt: IsNull() },
    });
    if (!apiKey) return null;

    const user = await this.userRepo.findOne({
      where: { id: apiKey.userId },
      select: ['id', 'username', 'authority', 'status', 'statusEndsAt'],
    });
    if (!user || isAccountBlocked(user.status, user.statusEndsAt)) return null;

    // 异步更新 lastUsedAt，不阻塞请求
    void this.apiKeyRepo.update(apiKey.id, { lastUsedAt: new Date() });

    return {
      sub: user.id,
      username: user.username,
      role: mapAuthorityToRole(user.authority),
    };
  }

  /**
   * 列出用户的所有 API Key（不含 hash）
   */
  async listApiKeys(userId: number): Promise<
    {
      id: number;
      name: string;
      keyPrefix: string;
      createdAt: Date;
      lastUsedAt: Date | null;
      revokedAt: Date | null;
    }[]
  > {
    const keys = await this.apiKeyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: [
        'id',
        'name',
        'keyPrefix',
        'createdAt',
        'lastUsedAt',
        'revokedAt',
      ],
    });
    return keys;
  }

  /**
   * 撤销 API Key
   */
  async revokeApiKey(userId: number, id: number): Promise<void> {
    const apiKey = await this.apiKeyRepo.findOne({ where: { id } });
    if (!apiKey) {
      throw new NotFoundException('API Key 不存在');
    }
    if (apiKey.userId !== userId) {
      throw new ForbiddenException('无权操作此 API Key');
    }
    await this.apiKeyRepo.update(id, { revokedAt: new Date() });
  }
}
