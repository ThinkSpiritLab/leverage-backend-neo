import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../../database/entities/setting.entity';

@Injectable()
export class SettingService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingRepo: Repository<Setting>,
  ) {}

  /**
   * 获取配置值（字符串），带 12s 缓存
   */
  async get(key: string): Promise<string | null> {
    const setting = await this.settingRepo.findOne({
      where: { key },
      cache: 12 * 1000,
    });
    return setting?.valueString ?? null;
  }

  /**
   * 设置配置值（字符串）
   */
  async set(key: string, value: string): Promise<void> {
    await this.settingRepo.upsert({ key, valueString: value, type: 'string' }, [
      'key',
    ]);
  }

  /**
   * 获取数值类型配置项（fix #36）
   * Setting 内部以字符串存储，取时用 parseFloat 转换。
   * @param key 配置 key
   * @param defaultValue 配置不存在或无法解析时的默认值
   */
  async getNumber(key: string, defaultValue?: number): Promise<number> {
    const value = await this.get(key);
    if (value === null || value === '') return defaultValue ?? 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? (defaultValue ?? 0) : parsed;
  }

  /**
   * 写入数值类型配置项（fix #36）
   */
  async setNumber(key: string, value: number): Promise<void> {
    await this.settingRepo.upsert(
      { key, valueString: String(value), type: 'number' },
      ['key'],
    );
  }

  /**
   * 获取布尔类型配置项
   */
  async getBoolean(key: string, defaultValue?: boolean): Promise<boolean> {
    const value = await this.get(key);
    if (value === null || value === '') return defaultValue ?? false;
    return value === 'true' || value === '1';
  }

  /**
   * 获取所有配置
   */
  async getAll(): Promise<Setting[]> {
    return this.settingRepo.find();
  }

  /**
   * 获取公开配置（特定 key 列表）
   */
  async getPublic(): Promise<Record<string, string>> {
    const publicKeys = [
      'showSubmission',
      'maxSubmitPerMin',
      'siteName',
      'siteDescription',
    ];
    const settings = await this.settingRepo.find({
      where: publicKeys.map((key) => ({ key })),
    });
    return settings.reduce(
      (acc, s) => {
        acc[s.key] = s.valueString;
        return acc;
      },
      {} as Record<string, string>,
    );
  }

  // =========== 常用快捷方法 ===========

  /**
   * 是否展示别人的提交
   */
  async isShowSubmission(): Promise<boolean> {
    return this.getBoolean('showSubmission', true);
  }

  /**
   * 最大提交频率（次/分钟）
   */
  async getMaxSubmitPerMin(): Promise<number> {
    return this.getNumber('maxSubmitPerMin', 10);
  }
}
