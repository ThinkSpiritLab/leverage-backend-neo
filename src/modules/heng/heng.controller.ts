import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
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
  private readonly allowedIps: string[] = (() => {
    const manual = process.env.HENG_ALLOWED_IPS
      ? process.env.HENG_ALLOWED_IPS.split(',').map(ip => ip.trim()).filter(Boolean)
      : [];
    // 自动从 HENG_BASE_URL 中提取 hostname 并加入白名单
    // 这样只要 OJ 配置了评测机地址，该机器的回调就自动被信任
    const hengUrl = process.env.HENG_BASE_URL;
    if (hengUrl) {
      try {
        const { hostname } = new URL(hengUrl);
        if (hostname && !manual.includes(hostname)) {
          manual.push(hostname);
        }
        // localhost / 127.0.0.1 / ::1 互为别名，一律全加入
        const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
        if (isLoopback) {
          for (const alias of ['localhost', '127.0.0.1', '::1']) {
            if (!manual.includes(alias)) manual.push(alias);
          }
        }
      } catch { /* invalid URL, ignore */ }
    }
    return manual;
  })();

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
    @Req() req: Request,
    @Headers('x-heng-token') token?: string,
  ): Promise<void> {
    this.assertCallbackAuthorized(req, token);
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
    @Req() req: Request,
    @Headers('x-heng-token') token?: string,
  ): Promise<void> {
    this.assertCallbackAuthorized(req, token);
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

  /**
   * 混合鉴权策略：IP 白名单 OR Token，任一通过即允许。
   * 两个都未配置时开发模式放行（兼容旧行为）。
   * 生产环境建议配置至少一项：
   *   HENG_ALLOWED_IPS=10.0.0.1,10.0.0.2
   *   HENG_CALLBACK_TOKEN=<random-secret>
   */
  private assertCallbackAuthorized(req: Request, token?: string): void {
    const hasIpPolicy = this.allowedIps.length > 0;
    const hasTokenPolicy = !!this.callbackToken;

    // 两个都没配：开发兼容模式，放行并告警
    if (!hasIpPolicy && !hasTokenPolicy) {
      this.logger.warn('Heng callback received with no auth policy configured (dev mode)');
      return;
    }

    // IP 白名单检查
    if (hasIpPolicy) {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        '';
      // 支持 IPv4-mapped IPv6（如 ::ffff:127.0.0.1）
      const normalizedIp = clientIp.replace(/^::ffff:/, '');
      if (this.allowedIps.includes(normalizedIp)) return;
    }

    // Token 检查
    if (hasTokenPolicy && token === this.callbackToken) return;

    throw new UnauthorizedException('heng callback auth failed (IP or token mismatch)');
  }
}
