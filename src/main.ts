// Load .env before importing AppModule: decorators register providers at import time.
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { Request, Response, NextFunction } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jwt = require('jsonwebtoken');
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { getBackendRole, runsHttp } from './runtime/backend-role';

function registerShutdownFallback(): void {
  // NestJS shutdown hooks own normal termination; do not leave hung teardown indefinitely.
  process.on('SIGTERM', () => {
    setTimeout(() => {
      console.error('Forced exit after graceful shutdown timeout');
      process.exit(1);
    }, 15000).unref();
  });
}

export async function bootstrap() {
  const role = getBackendRole();
  if (!runsHttp(role)) {
    const worker = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
    worker.useLogger(worker.get(Logger));
    worker.enableShutdownHooks();
    registerShutdownFallback();
    worker.get(Logger).log('Worker application context started (no HTTP listener)');
    return;
  }
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,  // disable default, we set our own limit below
  });

  // Increase body size limit for Botzone callback payloads (full game logs can be large)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Use nestjs-pino as the logger
  app.useLogger(app.get(Logger));

  // Bull Board auth guard — must be registered BEFORE NestJS initializes routes
  // because @bull-board/nestjs mounts as an Express sub-app, bypassing NestJS middleware
  app.use('/admin/queues', (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'] as string | undefined;
    const queryToken = req.query['token'] as string | undefined;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;

    if (!token) {
      res.status(401).send(`
        <html><body style="font-family:sans-serif;padding:2em">
          <h2>🔒 Bull Board — Admin Only</h2>
          <p>Please provide your admin JWT token:</p>
          <form method="GET">
            <input name="token" type="text" placeholder="Paste JWT token here" style="width:400px;padding:8px">
            <button type="submit" style="padding:8px 16px">Enter</button>
          </form>
        </body></html>
      `);
      return;
    }
    try {
      const secret = process.env.JWT_ACCESS_SECRET ?? 'change_me_access_secret';
      const payload = jwt.verify(token, secret) as any;
      const authority: string = payload.authority ?? payload.role ?? '';
      if (!['admin', 'sa', 'superadmin'].includes(authority)) {
        res.status(403).send('<html><body><h2>403 Forbidden — Admin role required</h2></body></html>');
        return;
      }
      next();
    } catch {
      res.status(401).send('<html><body><h2>401 Unauthorized — Invalid or expired token</h2></body></html>');
    }
  });

  // gzip compression for large JSON responses (leaderboard, problem list, etc.)
  // Exclude SSE endpoints: compression buffers streamed responses
  app.use(compression({
    filter: (req, res) => {
      if (req.path?.includes('/human-sse')) return false;
      return compression.filter(req, res);
    },
  }));

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

  // Enable shutdown hooks — NestJS will call onApplicationShutdown() on SIGTERM/SIGINT
  app.enableShutdownHooks();

  registerShutdownFallback();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3000);
  await app.listen(port);
  app.get(Logger).log(`Application listening on port ${port}`);
}

if (require.main === module) {
  void bootstrap();
}
