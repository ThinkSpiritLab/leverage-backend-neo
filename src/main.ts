import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use nestjs-pino as the logger
  app.useLogger(app.get(Logger));

  // gzip compression for large JSON responses (leaderboard, problem list, etc.)
  app.use(compression());

  // Helmet security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // SPA doesn't need strict CSP
      crossOriginEmbedderPolicy: false, // allow embedding images etc.
    }),
  );

  // CORS — restrict origin in production via CORS_ORIGIN env variable
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor (slow requests > 1s + errors)
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger docs (disabled in production)
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Leverage API')
      .setDescription('Leverage Online Judge Backend API')
      .setVersion('2.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3000);
  await app.listen(port);
  app.get(Logger).log(`Application listening on port ${port}`);
}

bootstrap();
