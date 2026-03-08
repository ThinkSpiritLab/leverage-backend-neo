import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { StatisticsService } from './statistics.service';

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  /**
   * GET /statistics/overview
   * 系统概览（admin+）
   */
  @Get('overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取系统概览（admin+）' })
  getSystemOverview() {
    return this.statisticsService.getSystemOverview();
  }

  /**
   * GET /statistics/problem/:id/ratio
   * 题目通过率（公开）
   */
  @Get('problem/:id/ratio')
  @ApiOperation({ summary: '获取题目通过率' })
  getSubmitRatio(@Param('id', ParseIntPipe) id: number) {
    return this.statisticsService.getSubmitRatio(id);
  }

  /**
   * GET /statistics/user/:id/activity
   * 用户活跃度（公开）
   */
  @Get('user/:id/activity')
  @ApiOperation({ summary: '获取用户活跃度' })
  getUserActivity(@Param('id', ParseIntPipe) id: number) {
    return this.statisticsService.getUserActivity(id);
  }
}
