import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueModule } from '../queue/queue.module';
import { ReceiveModule } from '../receive/receive.module';
import { SubmissionModule } from '../submission/submission.module';
import { CompeteModule } from '../compete/compete.module';
import { runsWorkers } from '../../runtime/backend-role';
import { DockerSandbox } from './docker-sandbox';
import { JudgeEngine } from './judge-engine';
import { InternalJudgeService } from './internal-judge.service';
import { InternalJudgeWorker } from './internal-judge.worker';

@Module({
  imports: [QueueModule, ReceiveModule, SubmissionModule, CompeteModule],
  providers: [
    { provide: DockerSandbox, inject: [ConfigService], useFactory: (config: ConfigService) => new DockerSandbox({ image: config.get<string>('judge.image', 'leverage-judge-runtime:local') }) },
    { provide: JudgeEngine, inject: [DockerSandbox, ConfigService], useFactory: (sandbox: DockerSandbox, config: ConfigService) => new JudgeEngine(sandbox, config.get('judge.maxMatchMs', 300000), config.get('judge.maxRounds', 1000)) },
    InternalJudgeService,
    ...(runsWorkers() ? [InternalJudgeWorker] : []),
  ],
  exports: [InternalJudgeService],
})
export class JudgeRuntimeModule {}
