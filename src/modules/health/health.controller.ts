import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { RedisService } from '../redis/redis.service'

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    const errors: string[] = []

    // Check DB
    try {
      await this.dataSource.query('SELECT 1')
    } catch {
      errors.push('database')
    }

    // Check Redis
    try {
      await this.redis.getClient().ping()
    } catch {
      errors.push('redis')
    }

    if (errors.length > 0) {
      throw new ServiceUnavailableException({
        status: 'error',
        timestamp: new Date().toISOString(),
        failed: errors,
      })
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }
}
