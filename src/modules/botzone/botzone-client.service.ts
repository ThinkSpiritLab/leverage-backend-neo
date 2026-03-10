import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  EnqueueParams,
  EnqueueResult,
  IJudgeProvider,
  JudgeProviderName,
  PollResult,
} from '../judge-provider/judge-provider.interface';
import { Status } from '../heng/heng.types';
import {
  BOTZONE_TERMINAL_STATES,
  BotzoneCallbackBody,
  BotzoneGameResult,
  BotzoneJobState,
  BotzoneOJResult,
  BotzonePollResponse,
  BotzoneSubmitRequest,
  BotzoneSubmitResponse,
  LEVERAGE_LANG_TO_BOTZONE,
  botzoneStateToStatus,
} from './botzone.types';

/**
 * BotzoneClientService
 *
 * HTTP adapter for the botzone-neo judge service.
 * Implements IJudgeProvider so it can be used interchangeably
 * with other judge providers.
 *
 * Config env vars:
 *   BOTZONE_BASE_URL   — base URL of botzone-neo API
 *   BOTZONE_API_KEY    — API key for authenticating requests
 *   BOTZONE_PROBLEM_ID — default problem ID on botzone-neo (can be overridden per problem)
 */
@Injectable()
export class BotzoneClientService implements IJudgeProvider {
  readonly name = JudgeProviderName.Botzone;

  private readonly logger = new Logger(BotzoneClientService.name);
  private readonly httpClient: AxiosInstance;
  private readonly callbackBase: string;
  private readonly defaultProblemId: string;

  constructor(private readonly configService: ConfigService) {
    const baseURL = this.configService.get<string>('botzone.baseUrl', '');
    const apiKey = this.configService.get<string>('botzone.apiKey', '');
    this.callbackBase = this.configService.get<string>(
      'baseUrl',
      'http://localhost:3000',
    );
    this.defaultProblemId = this.configService.get<string>(
      'botzone.defaultProblemId',
      '',
    );

    this.httpClient = axios.create({
      baseURL,
      timeout: 10_000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
  }

  /**
   * Submit a judge task to botzone-neo.
   * Returns the external job ID and a callbackToken for the result.
   */
  async enqueue(params: EnqueueParams): Promise<EnqueueResult> {
    const {
      submissionId,
      language,
      code,
      timeLimit,
      memoryLimit,
      externalProblemId,
    } = params;

    const botzoneLanguage = LEVERAGE_LANG_TO_BOTZONE[language] ?? 'cpp17';
    const problemId = externalProblemId ?? this.defaultProblemId;
    const callbackUrl = `${this.callbackBase}/botzone/callback`;
    const correlationId = String(submissionId);

    const body: BotzoneSubmitRequest = {
      sourceCode: Buffer.from(code, 'utf-8').toString('base64'),
      language: botzoneLanguage,
      problemId,
      timeLimit,
      memoryLimitMB: Math.round(memoryLimit),
      callbackUrl,
      correlationId,
    };

    this.logger.log(
      `Submitting to botzone: submissionId=${submissionId}, language=${botzoneLanguage}`,
    );

    const res = await this.httpClient.post<BotzoneSubmitResponse>(
      '/api/judger/submit',
      body,
    );

    const { jobId } = res.data;
    this.logger.log(
      `Botzone accepted: submissionId=${submissionId}, jobId=${jobId}`,
    );

    return {
      externalJobId: jobId,
      providerMeta: {
        problemId,
        language: botzoneLanguage,
        callbackUrl,
      },
    };
  }

  /**
   * Poll botzone-neo for the result of a previously submitted job.
   * GET /v1/judge/:jobId/status → { jobId, state, type, finishedOn?, failedReason?, result? }
   */
  async poll(submissionId: number, externalJobId: string): Promise<PollResult> {
    this.logger.debug(
      `Polling botzone: submissionId=${submissionId}, jobId=${externalJobId}`,
    );

    const res = await this.httpClient.get<BotzonePollResponse>(
      `/api/judger/submission/${externalJobId}`,
    );

    const data = res.data;
    return this.buildPollResult(data.state, data.type, data.result);
  }

  /**
   * Map a BotzoneCallbackBody to a PollResult.
   * Used by the callback controller to avoid duplication.
   */
  mapCallback(body: BotzoneCallbackBody): PollResult {
    return this.buildPollResult(body.state, body.type, body.result);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build a PollResult from the state/type/result triple returned by both
   * the poll endpoint and the callback body.
   */
  private buildPollResult(
    state: BotzoneJobState,
    type: 'oj' | 'botzone',
    result?: BotzoneOJResult | BotzoneGameResult,
  ): PollResult {
    const done = BOTZONE_TERMINAL_STATES.has(state);
    const status = botzoneStateToStatus(state, result);

    if (!done) {
      return { done: false, status };
    }

    if (state === 'failed') {
      return { done: true, status: Status.SE };
    }

    // state === 'finished'
    if (!result) {
      return { done: true, status: Status.SE };
    }

    if (type === 'oj') {
      return this.buildOJPollResult(result as BotzoneOJResult, status);
    } else {
      return this.buildGamePollResult(result as BotzoneGameResult, status);
    }
  }

  /**
   * Map an OJ result to PollResult.
   * judgeResult shape: { testcases: [{id, verdict, time, memory, actualOutput, message}] }
   */
  private buildOJPollResult(result: BotzoneOJResult, status: number): PollResult {
    const testcases = result.testcases.map((tc) => ({
      id: tc.id,
      verdict: tc.verdict,
      time: tc.timeMs,
      memory: tc.memoryKb,
      actualOutput: tc.actualOutput,
      message: tc.message,
    }));

    const judgeResult = JSON.stringify({ testcases });

    // Aggregate time/memory from test cases (max over all cases)
    const time =
      result.testcases.length > 0
        ? Math.max(...result.testcases.map((tc) => tc.timeMs ?? 0))
        : undefined;
    const memory =
      result.testcases.length > 0
        ? Math.max(...result.testcases.map((tc) => tc.memoryKb ?? 0))
        : undefined;

    const pollResult: PollResult = {
      done: true,
      status,
      judgeResult,
      time: time !== undefined && time > 0 ? time : undefined,
      memory: memory !== undefined && memory > 0 ? memory : undefined,
    };

    // Store compile error message when verdict is CE
    if (result.verdict === 'CompileError' && result.compile?.message) {
      pollResult.compileErrorMsg = result.compile.message;
    }

    return pollResult;
  }

  /**
   * Map a Botzone game result to PollResult.
   * judgeResult shape: { verdict, finalResult }
   * providerMeta:      { gameLog: { rounds, finalResult } }
   */
  private buildGamePollResult(result: BotzoneGameResult, status: number): PollResult {
    const judgeResult = JSON.stringify({
      verdict: result.verdict,
      finalResult: result.finalResult ?? {},
    });

    const providerMeta: Record<string, unknown> = {
      gameLog: {
        rounds: result.rounds ?? [],
        finalResult: result.finalResult ?? {},
      },
    };

    return {
      done: true,
      status,
      judgeResult,
      providerMeta,
    };
  }
}
