import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Suspicion } from '../../database/entities/suspicion.entity';

export interface SuspicionQuery {
  courseId?: number;
  contestId?: number;
  page: number;
  perPage: number;
}

@Injectable()
export class SuspicionService {
  constructor(
    @InjectRepository(Suspicion)
    private readonly suspicionRepo: Repository<Suspicion>,
  ) {}

  /**
   * 按 hashsum 查询相关联的可疑提交
   */
  async findByHash(hashsum: string): Promise<Suspicion[]> {
    return this.suspicionRepo.find({
      where: { hashsum },
      relations: ['submission', 'submission.user', 'submission.problem', 'submission.misc'],
    });
  }

  /**
   * 标记已审查
   */
  async markChecked(submissionId: number, checked: boolean): Promise<void> {
    const sus = await this.suspicionRepo.findOne({ where: { submissionId } });
    if (!sus) throw new NotFoundException(`Suspicion not found for submission ${submissionId}`);
    sus.checked = checked;
    await this.suspicionRepo.save(sus);
  }

  /**
   * 获取可疑提交列表（分页）
   */
  async findAll(
    query: SuspicionQuery,
  ): Promise<{ items: Suspicion[]; total: number }> {
    const { courseId, contestId, page, perPage } = query;

    const qb = this.suspicionRepo
      .createQueryBuilder('sus')
      .leftJoinAndSelect('sus.submission', 'submission')
      .leftJoinAndSelect('submission.user', 'user')
      .leftJoinAndSelect('submission.problem', 'problem')
      .orderBy('sus.submissionId', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (courseId !== undefined) {
      qb.andWhere('submission.courseId = :courseId', { courseId });
    }

    if (contestId !== undefined) {
      qb.andWhere('submission.contestId = :contestId', { contestId });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * 导出可疑提交 Excel（sus-xlsx 格式）
   * 返回 Buffer（xlsx 格式）
   */
  async exportSus(contestId: number): Promise<Buffer> {
    const items = await this.suspicionRepo
      .createQueryBuilder('sus')
      .leftJoinAndSelect('sus.submission', 'submission')
      .leftJoinAndSelect('submission.user', 'user')
      .leftJoinAndSelect('submission.problem', 'problem')
      .where('submission.contestId = :contestId', { contestId })
      .getMany();

    if (!items.length) {
      throw new NotFoundException(`竞赛 #${contestId} 没有可疑提交数据`);
    }

    // 构建简单 CSV 格式返回（不依赖 xlsx 库）
    const rows: string[] = [
      'submissionId,userId,username,problemId,hashsum,mas0,md1,def,con,cpp,oo,cr,html,chn,qq,checked',
    ];

    for (const sus of items) {
      const sub = sus.submission as
        | {
            userId?: string | number | null;
            user?: { username?: string | null };
            problemId?: string | number | null;
          }
        | null
        | undefined;
      rows.push(
        [
          sus.submissionId,
          sub?.userId ?? '',
          sub?.user?.username ?? '',
          sub?.problemId ?? '',
          sus.hashsum ?? '',
          sus.mas0,
          sus.md1,
          sus.def,
          sus.con,
          sus.cpp,
          sus.oo,
          sus.cr,
          sus.html,
          sus.chn,
          sus.qq,
          sus.checked ? 1 : 0,
        ].join(','),
      );
    }

    return Buffer.from(rows.join('\n'), 'utf-8');
  }
}
