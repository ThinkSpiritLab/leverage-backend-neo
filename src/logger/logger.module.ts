import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino'

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = process.env.NODE_ENV === 'production'
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
              ignore: (req: any) => req.url === '/health',
            },
            serializers: {
              req(req: any) {
                return {
                  method: req.method,
                  url: req.url,
                  remoteAddress: req.remoteAddress,
                }
              },
            },
          },
        }
      },
    }),
  ],
})
export class LoggerModule {}
