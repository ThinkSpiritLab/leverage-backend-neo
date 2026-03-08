import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JUDGE_RX_QUEUE } from '../queue/queue.constants';
import type {
  JudgeResult,
  JudgeRxPayload,
  JudgeStateUpdate,
} from './heng.types';
import { JudgeState } from './heng.types';

/**
 * HengController
 *
 * 接收来自 heng-controller 的评测回调，只负责将结果推入 judge-rx 队列（异步解耦）。
 *
 * POST /heng/update/:submissionId/:judgeId — 中间状态回调
 * POST /heng/finish/:submissionId/:judgeId — 最终结果回调
 */
@ApiTags('heng')
@Controller('heng')
export class HengController {
  private readonly logger = new Logger(HengController.name);
  private readonly callbackToken = process.env.HENG_CALLBACK_TOKEN;

  constructor(
    @InjectQueue(JUDGE_RX_QUEUE)
    private readonly judgeRxQueue: Queue<JudgeRxPayload>,
  ) {}

  /**
   * heng-controller 中间状态回调
   * 将状态推入 judge-rx 队列，由 JudgeRxWorker 异步处理
   */
  @Post('update/:submissionId/:judgeId')
  @HttpCode(200)
  @ApiOperation({ summary: 'heng-controller 中间状态回调' })
  async receiveUpdate(
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @Param('judgeId') judgeId: string,
    @Body() body: { state: JudgeState },
    @Headers('x-heng-token') token?: string,
  ): Promise<void> {
    this.assertCallbackAuthorized(token);
    this.logger.debug(
      `Update callback: submissionId=${submissionId}, state=${body.state}`,
    );

    const payload: JudgeRxPayload = {
      submissionId,
      judgeId,
      type: 'update',
      data: { state: body.state } satisfies JudgeStateUpdate,
    };

    await this.judgeRxQueue.add(payload, {
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  /**
   * heng-controller 最终结果回调
   * 将结果推入 judge-rx 队列，由 JudgeRxWorker 异步处理
   */
  @Post('finish/:submissionId/:judgeId')
  @HttpCode(200)
  @ApiOperation({ summary: 'heng-controller 最终结果回调' })
  async receiveFinish(
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @Param('judgeId') judgeId: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-heng-token') token?: string,
  ): Promise<void> {
    this.assertCallbackAuthorized(token);
    const result = body as unknown as JudgeResult;
    this.logger.log(
      `Finish callback: submissionId=${submissionId}, cases=${result.cases?.length}`,
    );

    const payload: JudgeRxPayload = {
      submissionId,
      judgeId,
      type: 'finish',
      data: result,
    };

    await this.judgeRxQueue.add(payload, {
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  private assertCallbackAuthorized(token?: string): void {
    // 未配置 token 时保持兼容（建议生产环境配置 HENG_CALLBACK_TOKEN）
    if (!this.callbackToken) return;
    if (!token || token !== this.callbackToken) {
      throw new UnauthorizedException('invalid heng callback token');
    }
  }
}
