import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TransmitService } from './transmit.service';

@ApiTags('transmit')
@Controller('transmit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class TransmitController {
  constructor(private readonly transmitService: TransmitService) {}

  /**
   * GET /transmit/judgers
   * 列出所有评测机（已弃用，返回静态数据）
   */
  @Get('judgers')
  @ApiOperation({ summary: '列出评测机（deprecated，返回静态数据）' })
  listJudgers() {
    return this.transmitService.listJudgers();
  }

  /**
   * GET /transmit/refresh-test-files
   * 手动触发从 OSS 刷新测试数据文件
   */
  @Get('refresh-test-files')
  @ApiOperation({ summary: '刷新测试数据文件（OSS 未配置时跳过）' })
  refreshTestFiles() {
    return this.transmitService.refreshTestFiles();
  }

  /**
   * GET /transmit/rebuild-rank-log
   * 手动重建排行榜日志
   */
  @Get('rebuild-rank-log')
  @ApiOperation({ summary: '重建竞赛/课程排行榜 Redis Sorted Set' })
  rebuildRankLog() {
    return this.transmitService.rebuildRankLog();
  }

  /**
   * GET /transmit/queue-status
   * 查询 BullMQ 队列状态
   */
  @Get('queue-status')
  @ApiOperation({ summary: '查询 BullMQ 评测队列状态' })
  getQueueStatus() {
    return this.transmitService.getQueueStatus();
  }
}
