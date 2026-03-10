import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Gamer } from '../../database/entities/gamer.entity';
import { Match } from '../../database/entities/match.entity';

@Injectable()
export class CompeteCleanupTask {
  private readonly logger = new Logger(CompeteCleanupTask.name);

  constructor(
    @InjectRepository(Gamer) private readonly gamerRepo: Repository<Gamer>,
    @InjectRepository(Match) private readonly matchRepo: Repository<Match>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupTestData() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.logger.log(`开始清理测试数据，截止时间：${cutoff.toISOString()}`);

    // 删除超过 24h 的测试对局
    const matchResult = await this.matchRepo.delete({
      isTest: true as any,
      createdAt: LessThan(cutoff),
    });
    this.logger.log(`已删除测试对局：${matchResult.affected ?? 0} 条`);

    // 删除超过 24h 的测试 gamer
    const gamerResult = await this.gamerRepo.delete({
      isTest: true,
      createdAt: LessThan(cutoff),
    });
    this.logger.log(`已删除测试 Bot：${gamerResult.affected ?? 0} 条`);
  }
}
