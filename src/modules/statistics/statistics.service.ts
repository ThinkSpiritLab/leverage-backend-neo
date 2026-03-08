import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Problem } from '../../database/entities/problem.entity';
import { Submission } from '../../database/entities/submission.entity';

export interface ActivityRecord {
  date: string;
  count: number;
}

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Problem)
    private readonly problemRepo: Repository<Problem>,
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 获取题目通过率
   */
  async getSubmitRatio(
    problemId: number,
  ): Promise<{ accepted: number; total: number }> {
    const result = await this.submissionRepo
      .createQueryBuilder('s')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN s.status = 1 THEN 1 ELSE 0 END)', 'accepted')
      .where('s.problemId = :problemId', { problemId })
      .getRawOne<{ accepted: string; total: string }>();

    return {
      accepted: Number(result?.accepted ?? 0),
      total: Number(result?.total ?? 0),
    };
  }

  /**
   * 获取用户活跃度（过去 365 天每天提交数）
   */
  async getUserActivity(userId: number): Promise<ActivityRecord[]> {
    const results = await this.submissionRepo
      .createQueryBuilder('s')
      .select('DATE(s.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('s.userId = :userId', { userId })
      .andWhere('s.createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY)')
      .groupBy('DATE(s.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; count: string }>();

    return results.map((r) => ({
      date: r.date,
      count: Number(r.count),
    }));
  }

  /**
   * 获取系统概览
   */
  async getSystemOverview(): Promise<{
    users: number;
    problems: number;
    submissions: number;
  }> {
    const [users, problems, submissions] = await Promise.all([
      this.userRepo.count(),
      this.problemRepo.count(),
      this.submissionRepo.count(),
    ]);

    return { users, problems, submissions };
  }
}
