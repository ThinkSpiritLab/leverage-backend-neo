import { BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { InternalJudgeService } from './internal-judge.service';
import { INTERNAL_MATCH_JOB, INTERNAL_SUBMISSION_JOB, type MatchJob, type SubmissionJob } from './job.types';

@Injectable()
@Processor(JUDGE_TX_QUEUE)
export class InternalJudgeWorker implements BeforeApplicationShutdown {
  constructor(@InjectQueue(JUDGE_TX_QUEUE) private readonly queue: Queue, private readonly judge: InternalJudgeService) {}
  @Process({ name: INTERNAL_SUBMISSION_JOB, concurrency: 1 })
  submission(job: Job<SubmissionJob>): Promise<void> { return this.judge.submission(job.data); }
  @Process({ name: INTERNAL_MATCH_JOB, concurrency: 1 })
  match(job: Job<MatchJob>): Promise<void> { return this.judge.match(job.data); }
  async beforeApplicationShutdown(): Promise<void> {
    try { await this.queue.pause(true, true); }
    finally {
      await this.judge.shutdown();
      await this.queue.close();
    }
  }
}
