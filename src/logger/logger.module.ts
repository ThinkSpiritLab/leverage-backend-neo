import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      useFactory: () => {
        const isProduction = process.env.NODE_ENV === 'production';
        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            ...(isProduction
              ? {}
              : {
                  transport: {
                    target: 'pino-pretty',
                    options: {
                      colorize: true,
                      singleLine: false,
                      translateTime: 'HH:MM:ss',
                      ignore: 'pid,hostname',
                    },
                  },
                }),
            // Suppress health check noise
            autoLogging: {
              ignore: (req: { url?: string }) => req.url === '/health',
            },
            serializers: {
              req(req: {
                method?: string;
                url?: string;
                remoteAddress?: string;
              }) {
                return {
                  method: req.method,
                  // EventSource and judge callbacks carry capabilities in queries.
                  url: req.url?.split('?')[0],
                  remoteAddress: req.remoteAddress,
                };
              },
            },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
