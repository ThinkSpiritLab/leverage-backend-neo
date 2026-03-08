import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * MetricsAuthMiddleware
 *
 * Protects the /metrics endpoint from public access.
 * Allows access from:
 *   1. Loopback IPs (127.0.0.1 / ::1) — Prometheus scraping from same host
 *   2. METRICS_TOKEN env var — Bearer token auth for remote scrapers
 */
@Injectable()
export class MetricsAuthMiddleware implements NestMiddleware {
  private readonly allowedIps = new Set([
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
  ]);
  private readonly metricsToken = process.env.METRICS_TOKEN;

  use(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip ?? req.socket.remoteAddress ?? '';

    // Allow loopback
    if (this.allowedIps.has(ip)) {
      return next();
    }

    // Allow Bearer token if configured
    if (this.metricsToken) {
      const authHeader = req.headers['authorization'] ?? '';
      if (authHeader === `Bearer ${this.metricsToken}`) {
        return next();
      }
    }

    res.status(403).json({ message: 'Forbidden' });
  }
}
