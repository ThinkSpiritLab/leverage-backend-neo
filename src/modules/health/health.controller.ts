import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import Bull from 'bull';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';

const HEAP_LIMIT = 300 * 1024 * 1024; // 300 MB
const RSS_LIMIT = 512 * 1024 * 1024; // 512 MB

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    @InjectQueue(JUDGE_TX_QUEUE) private readonly judgeTxQueue: Bull.Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check — DB, Redis, and memory' })
  async check() {
    const info: Record<string, { status: 'up' | 'down'; message?: string }> =
      {};
    const errors: string[] = [];

    // ── Database ──────────────────────────────────────────────────────────────
    try {
      await this.dataSource.query('SELECT 1');
      info['database'] = { status: 'up' };
    } catch (err) {
      info['database'] = { status: 'down', message: String(err) };
      errors.push('database');
    }

    // ── Redis ─────────────────────────────────────────────────────────────────
    try {
      await this.redis.getClient().ping();
      info['redis'] = { status: 'up' };
    } catch (err) {
      info['redis'] = { status: 'down', message: String(err) };
      errors.push('redis');
    }

    // ── Memory ────────────────────────────────────────────────────────────────
    const mem = process.memoryUsage();

    if (mem.heapUsed > HEAP_LIMIT) {
      info['memory_heap'] = {
        status: 'down',
        message: `heapUsed ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB exceeds ${HEAP_LIMIT / 1024 / 1024} MB`,
      };
      errors.push('memory_heap');
    } else {
      info['memory_heap'] = {
        status: 'up',
        message: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB / ${HEAP_LIMIT / 1024 / 1024} MB`,
      };
    }

    if (mem.rss > RSS_LIMIT) {
      info['memory_rss'] = {
        status: 'down',
        message: `rss ${(mem.rss / 1024 / 1024).toFixed(1)} MB exceeds ${RSS_LIMIT / 1024 / 1024} MB`,
      };
      errors.push('memory_rss');
    } else {
      info['memory_rss'] = {
        status: 'up',
        message: `${(mem.rss / 1024 / 1024).toFixed(1)} MB / ${RSS_LIMIT / 1024 / 1024} MB`,
      };
    }

    const timestamp = new Date().toISOString();

    if (errors.length > 0) {
      throw new ServiceUnavailableException({
        status: 'error',
        info,
        error: errors.reduce<
          Record<string, { status: 'down'; message?: string }>
        >((acc, key) => {
          acc[key] = info[key] as { status: 'down'; message?: string };
          return acc;
        }, {}),
        timestamp,
      });
    }

    return { status: 'ok', info, timestamp };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — lightweight liveness check' })
  readiness() {
    return { status: 'ready', timestamp: new Date().toISOString() };
  }

  @Get('system')
  @ApiOperation({ summary: 'System info — process uptime, CPU, memory, Node version' })
  async systemInfo() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptimeSec = process.uptime();

    // DB response time
    let dbLatencyMs = -1;
    try {
      const t0 = Date.now();
      await this.dataSource.query('SELECT 1');
      dbLatencyMs = Date.now() - t0;
    } catch { /* ignore */ }

    // Redis response time
    let redisLatencyMs = -1;
    try {
      const t0 = Date.now();
      await this.redis.getClient().ping();
      redisLatencyMs = Date.now() - t0;
    } catch { /* ignore */ }

    const formatMB = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
    const formatUptime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    };

    return {
      process: {
        pid: process.pid,
        uptime: formatUptime(uptimeSec),
        uptimeSec: Math.floor(uptimeSec),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      memory: {
        heapUsed: formatMB(mem.heapUsed),
        heapTotal: formatMB(mem.heapTotal),
        rss: formatMB(mem.rss),
        external: formatMB(mem.external),
        heapUsedBytes: mem.heapUsed,
        rssBytes: mem.rss,
      },
      cpu: {
        userMs: Math.round(cpu.user / 1000),
        systemMs: Math.round(cpu.system / 1000),
      },
      latency: {
        dbMs: dbLatencyMs,
        redisMs: redisLatencyMs,
      },
      env: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('queues')
  @ApiOperation({ summary: 'Queue status — job counts for judge-tx queue' })
  async checkQueues() {
    const counts = await this.judgeTxQueue.getJobCounts();
    return {
      queue: JUDGE_TX_QUEUE,
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
      timestamp: new Date().toISOString(),
    };
  }
}
