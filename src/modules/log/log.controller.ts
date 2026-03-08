import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { LogService } from './log.service'

@ApiTags('logs')
@Controller('logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class LogController {
  constructor(private readonly logService: LogService) {}

  /**
   * GET /logs
   * 操作日志列表（admin+）
   */
  @Get()
  @ApiOperation({ summary: '获取操作日志列表（admin+）' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  findAll(
    @Query('userId') userId?: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.logService.findAll({
      userId: userId ? parseInt(userId, 10) : undefined,
      page: parseInt(page, 10) || 1,
      perPage: Math.min(parseInt(perPage, 10) || 20, 100),
    })
  }
}
