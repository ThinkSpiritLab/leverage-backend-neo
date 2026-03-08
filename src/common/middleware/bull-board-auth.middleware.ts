import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
/* eslint-disable @typescript-eslint/no-require-imports */
// jsonwebtoken is a CommonJS module — use require to avoid ESM/CJS conflict
const jwt = require('jsonwebtoken');

/**
 * BullBoardAuthMiddleware
 * 保护 /admin/queues — 要求有效的 admin/sa JWT token
 * 支持 Authorization: Bearer <token> 或 ?token=<token> 查询参数
 */
@Injectable()
export class BullBoardAuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Only protect /admin/queues and all sub-paths
    if (!req.path.startsWith('/admin/queues')) {
      return next();
    }

    const authHeader = req.headers['authorization'];
    const queryToken = req.query['token'] as string | undefined;

    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : queryToken;

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
      const isAdmin = ['admin', 'sa', 'superadmin'].includes(authority);

      if (!isAdmin) {
        res.status(403).send('<html><body><h2>403 Forbidden — Admin role required</h2></body></html>');
        return;
      }

      next();
    } catch {
      res.status(401).send('<html><body><h2>401 Unauthorized — Invalid or expired token</h2></body></html>');
    }
  }
}
