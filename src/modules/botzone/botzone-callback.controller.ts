import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
  Headers,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { BotzoneClientService } from './botzone-client.service';
import { BotzoneResultService } from './botzone-result.service';
import { BOTZONE_TERMINAL_STATES } from './botzone.types';
import type { BotzoneCallbackBody } from './botzone.types';

/**
 * BotzoneCallbackController
 *
 * Receives the result callback from botzone-neo.
 *
 * POST /botzone/callback
 *   - Raw OJ callback: signed query submissionId + attemptId + token
 *   - Legacy envelope: Bearer token or signed query token
 *   - Shared ReceiveService checks current attempt / legacy job identity
 *     and handles repeated terminal delivery idempotently.
 */
@ApiTags('botzone')
@SkipThrottle()
@Controller('botzone')
export class BotzoneCallbackController {
  private readonly logger = new Logger(BotzoneCallbackController.name);
  private readonly callbackToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly botzoneClient: BotzoneClientService,
    private readonly botzoneResultService: BotzoneResultService,
  ) {
    this.callbackToken = this.configService.get<string>(
      'botzone.callbackToken',
      '',
    );
  }

  /**
   * Botzone-neo result callback
   *
   * @param authHeader   Legacy Bearer token from Authorization header
   * @param body    Callback payload from botzone-neo
   */
  @Post('callback')
  @HttpCode(200)
  @ApiOperation({ summary: 'botzone-neo judge result callback' })
  async receiveCallback(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: BotzoneCallbackBody,
    @Query('submissionId') querySubmissionId?: string,
    @Query('attemptId') attemptId?: string,
    @Query('token') queryToken?: string,
  ): Promise<{ ok: boolean }> {
    this.assertToken(authHeader, queryToken, querySubmissionId, attemptId);

    const legacy = 'state' in body;
    // Raw upstream results contain no job or submission identity. A signed
    // attempt URL is mandatory; Bearer auth alone cannot bind this result.
    if (!legacy) {
      if (!querySubmissionId || !attemptId) return { ok: false };
      this.assertToken(undefined, queryToken, querySubmissionId, attemptId);
    }
    const correlationId = legacy ? body.correlationId : undefined;
    const jobId = legacy ? body.jobId : undefined;
    const state = legacy ? body.state : 'completed';
    const submissionId = Number(querySubmissionId ?? correlationId);

    if (!Number.isSafeInteger(submissionId) || submissionId <= 0 ||
        (attemptId !== undefined && !/^[a-f0-9]{32}$/.test(attemptId)) ||
        (legacy && querySubmissionId !== undefined && correlationId !== undefined && String(submissionId) !== correlationId)) {
      this.logger.warn(
        `Botzone callback: invalid correlationId="${correlationId}"`,
      );
      return { ok: false };
    }

    this.logger.log(
      `Botzone callback: submissionId=${submissionId}, jobId=${jobId}, state=${state}`,
    );

    // Only finalize on terminal state; intermediate states are update-only
    const isTerminal = !legacy || BOTZONE_TERMINAL_STATES.has(state);

    if (isTerminal) {
      const pollResult = this.botzoneClient.mapCallback(body);
      // BotzoneResultService handles idempotency internally
      await this.botzoneResultService.finalize(submissionId, pollResult, jobId, attemptId);
    } else {
      // Intermediate state: no DB write needed, just log
      this.logger.debug(
        `Botzone intermediate state for submissionId=${submissionId}: ${state}`,
      );
    }

    return { ok: true };
  }

  /**
   * Validate BOTZONE_CALLBACK_TOKEN.
   * Fail closed when callback authentication is not configured.
   */
  private assertToken(authHeader: string | undefined, queryToken?: string, submissionId?: string, attemptId?: string): void {
    if (!this.callbackToken) throw new UnauthorizedException('Botzone callback is not configured');

    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    const expected = authHeader !== undefined ? this.callbackToken : createHmac('sha256', this.callbackToken).update(`${submissionId}:${attemptId ?? ''}`).digest('hex');
    const supplied = Buffer.from(token ?? queryToken ?? '');
    const expectedBytes = Buffer.from(expected);
    if (supplied.length !== expectedBytes.length || !timingSafeEqual(supplied, expectedBytes)) {
      throw new UnauthorizedException('Invalid botzone callback token');
    }
  }
}
