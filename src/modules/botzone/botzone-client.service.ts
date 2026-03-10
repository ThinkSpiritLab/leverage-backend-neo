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
import {
  BOTZONE_STATUS_TO_LEVERAGE,
  BOTZONE_TERMINAL_STATUSES,
  BotzoneCallbackBody,
  BotzoneJobStatus,
  BotzonePollResponse,
  BotzoneSubmitRequest,
  BotzoneSubmitResponse,
  LEVERAGE_LANG_TO_BOTZONE,
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
   * Returns a PollResult indicating whether the job is done.
   */
  async poll(submissionId: number, externalJobId: string): Promise<PollResult> {
    this.logger.debug(
      `Polling botzone: submissionId=${submissionId}, jobId=${externalJobId}`,
    );

    const res = await this.httpClient.get<BotzonePollResponse>(
      `/api/judger/submission/${externalJobId}`,
    );

    const data = res.data;
    const botzoneStatus = data.status as BotzoneJobStatus;
    const done = BOTZONE_TERMINAL_STATUSES.has(botzoneStatus);
    const status = BOTZONE_STATUS_TO_LEVERAGE[botzoneStatus];

    if (!done) {
      return { done: false, status };
    }

    return {
      done: true,
      status,
      time: data.time,
      memory: data.memory,
      judgeResult: data.judgeResult,
      compileErrorMsg: data.compileErrorMsg,
    };
  }

  /**
   * Map a BotzoneCallbackBody to a PollResult.
   * Used by the callback controller to avoid duplication.
   */
  mapCallback(body: BotzoneCallbackBody): PollResult {
    const botzoneStatus = body.status as BotzoneJobStatus;
    const done = BOTZONE_TERMINAL_STATUSES.has(botzoneStatus);
    const status = BOTZONE_STATUS_TO_LEVERAGE[botzoneStatus];

    return {
      done,
      status,
      time: body.time,
      memory: body.memory,
      judgeResult: body.judgeResult,
      compileErrorMsg: body.compileErrorMsg,
    };
  }
}
