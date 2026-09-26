import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Gamer } from '../../database/entities/gamer.entity';
import { Match } from '../../database/entities/match.entity';
import { runsHttp } from '../../runtime/backend-role';
import { LeaseService } from '../redis/lease.service';

const CLEANUP_LEASE = 'compete:cleanup:test-data';
const CLEANUP_TTL_MS = 5 * 60_000;

@Injectable()
export class CompeteCleanupTask {
  private readonly logger = new Logger(CompeteCleanupTask.name);

  constructor(
    @InjectRepository(Gamer) private readonly gamerRepo: Repository<Gamer>,
    @InjectRepository(Match) private readonly matchRepo: Repository<Match>,
    private readonly lease: LeaseService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupTestData() {
    if (!runsHttp()) return;
    const token = await this.lease.acquire(CLEANUP_LEASE, CLEANUP_TTL_MS);
    if (!token) return;
    let lost = false;
    const renewal = setInterval(() => {
      void this.lease
        .renew(CLEANUP_LEASE, token, CLEANUP_TTL_MS)
        .then((ok) => {
          if (!ok) lost = true;
        })
        .catch((error: Error) => {
          lost = true;
          this.logger.warn(`Cleanup lease renewal failed: ${error.message}`);
        });
    }, 60_000);
    renewal.unref();
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      this.logger.log(`开始清理测试数据，截止时间：${cutoff.toISOString()}`);

      // 删除超过 24h 的测试对局
      const matchResult = await this.matchRepo.delete({
        isTest: true as any,
        createdAt: LessThan(cutoff),
      });
      this.logger.log(`已删除测试对局：${matchResult.affected ?? 0} 条`);

      // Do not start a second delete after ownership is lost.
      if (
        lost ||
        !(await this.lease.renew(CLEANUP_LEASE, token, CLEANUP_TTL_MS))
      )
        return;
      const gamerResult = await this.gamerRepo.delete({
        isTest: true,
        createdAt: LessThan(cutoff),
      });
      this.logger.log(`已删除测试 Bot：${gamerResult.affected ?? 0} 条`);
    } finally {
      clearInterval(renewal);
      try {
        await this.lease.release(CLEANUP_LEASE, token);
      } catch (error: any) {
        this.logger.warn(`Cleanup lease release failed: ${error.message}`);
      }
    }
  }
}
