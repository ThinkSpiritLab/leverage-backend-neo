import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { REQUIRE_LOG_KEY, LogSettings } from './log.decorator';
import { LogService } from './log.service';

@Injectable()
export class LogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly logService: LogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const settings = this.reflector.get<LogSettings | undefined>(
      REQUIRE_LOG_KEY,
      context.getHandler(),
    );

    if (!settings) return next.handle();

    const req = context.switchToHttp().getRequest();
    const userId: number | null = req.user?.sub ?? req.user?.id ?? null;

    return next.handle().pipe(
      tap(() => {
        const payload = settings.requirePayload
          ? JSON.stringify({ body: req.body, params: req.params, query: req.query }, (key, value: unknown) =>
              /password|passwd|secret|token|authorization|cookie|api[-_]?key/i.test(key) ? '[REDACTED]' : value)
          : '';
        // fire-and-forget: don't block response
        this.logService
          .create(userId!, `${settings.field}.${settings.action}`, payload)
          .catch(() => {});
      }),
    );
  }
}
