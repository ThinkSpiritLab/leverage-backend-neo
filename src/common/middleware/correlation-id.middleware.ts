import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * Correlation ID 中间件
 *
 * 为每个请求生成或透传唯一 ID，方便跨服务日志追踪。
 * - 读取客户端传入的 X-Correlation-ID header（如有）
 * - 否则生成新的 UUIDv4
 * - 将 ID 写入 response header X-Correlation-ID
 * - 将 ID 挂载到 request 对象，供后续日志使用
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(
    req: Request & { correlationId?: string },
    res: Response,
    next: NextFunction,
  ): void {
    const correlationId =
      (req.headers['x-correlation-id'] as string) || randomUUID();

    req.correlationId = correlationId;
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);

    next();
  }
}
