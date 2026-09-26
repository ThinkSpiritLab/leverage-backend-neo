import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import { Submission } from '../../database/entities/submission.entity';
import { SubmissionMisc } from '../../database/entities/submission-misc.entity';
import { Problem } from '../../database/entities/problem.entity';
import { Match } from '../../database/entities/match.entity';
import { Gamer } from '../../database/entities/gamer.entity';
import { Game } from '../../database/entities/game.entity';
import { Status } from '../judge-runtime/judge-status';
import { ReceiveService } from '../receive/receive.service';
import { SubmissionService } from '../submission/submission.service';
import { CompeteService, MatchStatus } from '../compete/compete.service';
import { HumanTurnService } from '../compete/human-turn.service';
import { JudgeEngine, JudgeCancelled } from './judge-engine';
import { problemCases } from './test-data';
import { runtimeLanguage, submissionLanguage, type SubmissionJob, type MatchJob } from './job.types';
import type { MatchExecution, MatchInput, ProgramSource } from './judge.contracts';
import { callBotWebhook } from './webhook-runner';

const pending = [Status.PENDING, Status.COMPILING, Status.JUDGING];

/** Trusted orchestration. Only source/stdin and explicit limits enter task containers. */
@Injectable()
export class InternalJudgeService {
  private readonly logger = new Logger(InternalJudgeService.name);
  private readonly active = new Set<AbortController>();
  private readonly work = new Set<Promise<unknown>>();
  private closing = false;
  constructor(
    private readonly data: DataSource,
    private readonly engine: JudgeEngine,
    private readonly receive: ReceiveService,
    private readonly submissions: SubmissionService,
    private readonly compete: CompeteService,
    private readonly human: HumanTurnService,
    private readonly config: ConfigService,
  ) {}

  private tracked<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new JudgeCancelled('cancelled'));
    const controller = new AbortController();
    this.active.add(controller);
    const work = fn(controller.signal).finally(() => { this.active.delete(controller); this.work.delete(work); });
    this.work.add(work);
    return work;
  }
  async shutdown(): Promise<void> {
    this.closing = true;
    for (const item of this.active) item.abort();
    await Promise.allSettled([...this.work]);
  }

  submission(job: SubmissionJob): Promise<void> {
    return this.tracked(async signal => {
      const repo = this.data.getRepository(Submission);
      const where = { id: job.submissionId, provider: 'internal', judgeAttempt: job.attemptId, status: In(pending) };
      const isCurrent = () => repo.existsBy(where);
      const submission = await repo.findOne({ where: { id: job.submissionId, provider: 'internal', judgeAttempt: job.attemptId } });
      if (!submission) return;
      if (!pending.includes(submission.status)) {
        // The SQL commit may have succeeded while post-commit rank publication failed.
        await this.receive.finalize(submission.id, { done: true, status: submission.status }, { provider: 'internal', attemptId: job.attemptId });
        return;
      }
      const problem = await this.data.getRepository(Problem).findOne({ where: { id: submission.problemId }, select: ['id', 'prefix', 'logicId', 'cases', 'timeLimit', 'memoryLimit', 'checkerCode', 'checkerLanguage'] });
      const misc = await this.data.getRepository(SubmissionMisc).findOneBy({ submissionId: submission.id });
      if (!problem || !misc) throw new Error('Submission source or problem is unavailable');
      const language = submissionLanguage[submission.language];
      const bonus = this.submissions.applyLanguageBonus(problem, submission.language);
      await repo.update(where, { status: Status.COMPILING });
      try {
        if (!language) throw new Error('Unsupported language');
        let checker: ProgramSource | undefined;
        if (problem.checkerCode) {
          const checkerLanguage = runtimeLanguage(problem.checkerLanguage ?? '');
          if (!checkerLanguage) throw new Error('Unsupported checker language');
          checker = { language: checkerLanguage, source: problem.checkerCode };
        }
        const result = await this.engine.submission({
          program: { language, source: misc.code }, checker,
          limits: { timeLimitMs: bonus.timeLimit, memoryLimitMb: bonus.memoryLimit, outputLimitBytes: 1024 * 1024 },
          cases: problemCases(this.config.get('judge.testCasesPath', '/tmp/testcases'), problem),
        }, signal, isCurrent, async () => { await repo.update(where, { status: Status.JUDGING }); });
        await this.receive.finalize(submission.id, result, { provider: 'internal', attemptId: job.attemptId });
      } catch (error) {
        if (error instanceof JudgeCancelled) {
          if (error.reason === 'superseded') return;
          throw error; // The queue may retry an interrupted submission; never invent a verdict.
        }
        this.logger.error(`Submission ${submission.id}: ${error instanceof Error ? error.message : 'judge error'}`);
        await this.receive.finalize(submission.id, { done: true, status: Status.SE, compileErrorMsg: 'Judge infrastructure or test-data error' }, { provider: 'internal', attemptId: job.attemptId });
      }
    });
  }

  match(job: MatchJob): Promise<void> {
    return this.tracked(async signal => {
      const repo = this.data.getRepository(Match);
      const match = await repo.findOne({ where: { id: job.matchId }, relations: ['game'] });
      if (!match) return;
      if ([MatchStatus.FINISHED, MatchStatus.ERROR].includes(match.status)) {
        // Repair a missed post-commit Redis/SSE notification without changing SQL/ELO.
        const saved = match.result ? JSON.parse(match.result) as MatchExecution : this.failed('Execution stopped');
        await this.compete.completeInternalMatch(match.id, saved, job.requesterId);
        return;
      }
      if (match.status === MatchStatus.RUNNING) {
        // Interactive inputs cannot be silently replayed after a worker was lost.
        await this.compete.completeInternalMatch(match.id, this.failed('Execution interrupted; start a new match'), job.requesterId);
        return;
      }
      const claimed = await repo.update({ id: match.id, status: MatchStatus.PENDING }, { status: MatchStatus.RUNNING });
      if (!claimed.affected) return;
      const owners: Record<string, number> = {};
      try {
        const game = await this.data.getRepository(Game).findOne({ where: { id: job.gameId }, select: ['id', 'judgerCode', 'judgerLanguage', 'timeLimit', 'memoryLimit', 'gamerQuantity', 'disabled'] });
        if (!game || game.id !== match.gameId) throw new Error('Match game is unavailable');
        const source = job.judge?.source ?? game.judgerCode;
        const language = runtimeLanguage(job.judge?.language ?? game.judgerLanguage ?? 'python');
        if (!source || !language) throw new Error('Game needs a supported judge program');
        if (job.judge && job.requesterId) owners.judge = job.requesterId;
        const gamers = await this.data.getRepository(Gamer).find({ where: { id: In(job.playerIds) }, select: ['id', 'userId', 'gameId', 'code', 'language', 'type', 'webhookUrl', 'webhookSecret', 'disabled', 'opensource'] });
        const players: MatchInput['players'] = job.playerIds.map((id, position) => {
          const gamer = gamers.find(item => item.id === id);
          if (!gamer || gamer.gameId !== game.id || gamer.disabled) throw new Error('Match player is unavailable');
          if (!gamer.opensource) owners[String(position)] = gamer.userId;
          const type = gamer.type ?? 'code';
          if (type === 'code') {
            const runtime = runtimeLanguage(gamer.language);
            if (!runtime || !gamer.code) throw new Error('Player needs a supported program');
            return { id, userId: gamer.userId, type, program: { language: runtime, source: gamer.code } };
          }
          if (!['human', 'external', 'webhook'].includes(type)) throw new Error('Unsupported player kind');
          return { id, userId: gamer.userId, type: type as 'human' | 'external' | 'webhook', webhookUrl: gamer.webhookUrl ?? undefined, webhookSecret: gamer.webhookSecret ?? undefined, timeoutMs: type === 'human' ? 180000 : type === 'external' ? 30000 : 10000 };
        });
        const result = await this.engine.match({
          matchId: match.id, judge: { language, source }, players,
          limits: { timeLimitMs: game.timeLimit, memoryLimitMb: game.memoryLimit, outputLimitBytes: 1024 * 1024 },
        }, {
          signal,
          isCurrent: () => repo.existsBy({ id: match.id, status: MatchStatus.RUNNING }),
          requestMove: (player, state, turnSignal) => player.type === 'webhook'
            ? callBotWebhook(player.webhookUrl ?? '', state, player.timeoutMs ?? 10000, turnSignal, player.webhookSecret)
            : this.human.waitForResponse(match.id, player.id, state, player.timeoutMs, player.userId, turnSignal),
        });
        await this.compete.completeInternalMatch(match.id, result, job.requesterId, owners);
      } catch (error) {
        if (error instanceof JudgeCancelled) {
          if (error.reason === 'superseded') return;
          throw error;
        }
        this.logger.error(`Match ${match.id}: ${error instanceof Error ? error.message : 'judge error'}`);
        await this.compete.completeInternalMatch(match.id, this.failed('Judge execution or configuration error'), job.requesterId, owners);
      }
    });
  }

  private failed(error: string): MatchExecution {
    return { status: 'error', verdict: 'ERROR', rounds: [], finalResult: {}, compileMessages: {}, error };
  }
}
