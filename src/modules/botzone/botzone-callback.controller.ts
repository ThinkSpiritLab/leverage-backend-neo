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
 *   - Authenticated via Bearer token: Authorization: Bearer <BOTZONE_CALLBACK_TOKEN>
 *   - Idempotent: re-delivery of the same jobId is a no-op once terminal
 *
 * The correlationId field in the callback body maps 1-to-1 with the
 * leverage submissionId, as set during submission enqueue.
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
   * @param token   Bearer token from Authorization header
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

    const { correlationId, jobId, state } = body;
    const submissionId = Number(querySubmissionId ?? correlationId);

    if (!Number.isSafeInteger(submissionId) || submissionId <= 0 || (attemptId !== undefined && !/^[a-f0-9]{32}$/.test(attemptId))) {
      this.logger.warn(
        `Botzone callback: invalid correlationId="${correlationId}"`,
      );
      return { ok: false };
    }

    this.logger.log(
      `Botzone callback: submissionId=${submissionId}, jobId=${jobId}, state=${state}`,
    );

    // Only finalize on terminal state; intermediate states are update-only
    const isTerminal = BOTZONE_TERMINAL_STATES.has(state);

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
