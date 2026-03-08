import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

/**
 * HTTP 请求日志拦截器
 *
 * 注意：项目已使用 nestjs-pino 的 pino-http 进行全量请求日志（含自动 req/res 记录）。
 * 本拦截器专注于补充以下场景：
 *  - 慢请求告警（响应时间 > 1000ms）
 *  - 非 HTTP 异常（pino-http 可能未捕获的错误路径）
 *
 * 生产环境噪音控制：只记录慢请求或错误，正常快速请求不重复输出。
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const correlationId = request.headers['x-correlation-id'] || '-';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const { statusCode } = response;
        const duration = Date.now() - start;

        // 只记录慢请求（>1s）或 HTTP 错误响应
        if (duration > 1000 || statusCode >= 400) {
          this.logger.log(
            `${method} ${url} ${statusCode} ${duration}ms [${correlationId}] - ${ip} "${userAgent}"`,
          );
        }
      }),
      catchError((err) => {
        const duration = Date.now() - start;
        this.logger.error(
          `${method} ${url} ERROR ${duration}ms [${correlationId}] - ${ip} "${userAgent}": ${err.message}`,
          err.stack,
        );
        throw err;
      }),
    );
  }
}
