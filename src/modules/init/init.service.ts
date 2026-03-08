import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Setting } from '../../database/entities/setting.entity';
import { hashPassword } from '../../common/utils/crypto.util';

@Injectable()
export class InitService implements OnModuleInit {
  private readonly logger = new Logger(InitService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Setting)
    private readonly settingRepo: Repository<Setting>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    // SKIP_INIT=true 跳过初始化
    if (this.configService.get<boolean>('skipInit')) {
      this.logger.log('跳过初始化（SKIP_INIT=true）');
      return;
    }

    const hasAdmin = await this.userRepo.findOne({
      where: { authority: 'sa' },
    });
    if (!hasAdmin) {
      await this.createInitialAdmin();
      this.logger.log('初始化完成：创建了 sa 账号');
    }

    await this.initSettings();
  }

  private async initSettings(): Promise<void> {
    const count = await this.settingRepo.count();
    if (count > 0) {
      this.logger.log('跳过设置初始化（settings 表非空）');
      return;
    }

    const defaults: Array<Pick<Setting, 'key' | 'valueString' | 'type' | 'note'>> = [
      { key: 'register.open', valueString: 'true', type: 'boolean', note: '是否开放注册' },
      { key: 'register.emailVerify', valueString: 'false', type: 'boolean', note: '注册是否需要邮箱验证' },
      { key: 'submission.maxPerMinute', valueString: '10', type: 'number', note: '每分钟最大提交次数' },
      { key: 'submission.showCode', valueString: 'true', type: 'boolean', note: '提交代码是否对所有人可见' },
      { key: 'problem.showAccepts', valueString: 'true', type: 'boolean', note: '是否显示题目通过数' },
      { key: 'game.maxCreateNo', valueString: '3', type: 'number', note: '每用户最多创建对战房间数' },
      { key: 'site.name', valueString: 'Leverage OJ', type: 'string', note: '站点名称' },
      { key: 'site.announcement', valueString: '', type: 'string', note: '全站公告（首页显示）' },
    ];

    await this.settingRepo.insert(defaults);
    this.logger.log(`初始化完成：写入 ${defaults.length} 条系统设置`);
  }

  private async createInitialAdmin(): Promise<void> {
    const username = this.configService.get<string>('init.saUsername', 'admin');
    const password = this.configService.get<string>(
      'init.saPassword',
      'Admin@123456',
    );

    const user = this.userRepo.create({
      username,
      passwordHash: hashPassword(password),
      authority: 'sa',
      nickname: 'Super Admin',
    });

    await this.userRepo.save(user);
    this.logger.log(`已创建 sa 账号：${username}`);
  }
}
