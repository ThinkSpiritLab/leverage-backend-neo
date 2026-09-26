import { Injectable } from '@nestjs/common';
import { ReceiveService } from '../receive/receive.service';
import { PollResult } from '../judge-provider/judge-provider.interface';

/** Provider adapter; all persistence and accounting live in ReceiveService. */
@Injectable()
export class BotzoneResultService {
  constructor(private readonly receiveService: ReceiveService) {}

  finalize(
    submissionId: number,
    result: PollResult,
    jobId?: string,
    attemptId?: string,
  ): Promise<void> {
    return this.receiveService.finalize(submissionId, result, {
      provider: 'botzone',
      jobId,
      attemptId,
    });
  }
}
