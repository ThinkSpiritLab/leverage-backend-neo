import { of } from 'rxjs';
import { LoggerModule } from '../../logger/logger.module';
import { LogInterceptor } from './log.interceptor';

describe('audit payload privacy', () => {
  it('omits query credentials from the configured HTTP logger', async () => {
    const modules = Reflect.getMetadata('imports', LoggerModule);
    const provider = modules.flatMap((item: any) => item.providers ?? []).find((item: any) => item.provide === 'pino-params');
    const config = await provider.useFactory();
    const logged = config.pinoHttp.serializers.req({ method: 'GET', url: '/compete/matches/1/human-sse?token=fixture-token', remoteAddress: '127.0.0.1' });
    expect(logged).toEqual({ method: 'GET', url: '/compete/matches/1/human-sse', remoteAddress: '127.0.0.1' });
  });
  it('keeps useful operation fields without persisting credentials', () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const interceptor = new LogInterceptor({ get: () => ({ field: 'user', action: 'update', requirePayload: true }) } as any, { create } as any);
    const req = { user: { sub: 1 }, body: { title: 'visible', password: 'fixture-password', nested: { webhookSecret: 'fixture-secret', api_key: 'fixture-key' } }, params: { id: 5 }, query: { token: 'fixture-token', page: '2' } };
    interceptor.intercept({ getHandler: () => null, switchToHttp: () => ({ getRequest: () => req }) } as any, { handle: () => of('ok') }).subscribe();
    const payload = create.mock.calls[0][2];
    expect(payload).toContain('visible');
    expect(payload).toContain('page');
    for (const value of ['fixture-password', 'fixture-secret', 'fixture-key', 'fixture-token']) expect(payload).not.toContain(value);
    expect(req.body.password).toBe('fixture-password');
  });
});
