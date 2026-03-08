import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SuspicionService } from './suspicion.service';

@ApiTags('suspicion')
@Controller('suspicion')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('supervisor')
@ApiBearerAuth()
export class SuspicionController {
  constructor(private readonly suspicionService: SuspicionService) {}

  /**
   * GET /suspicion
   * 可疑提交列表（supervisor+）
   */
  @Get()
  @ApiOperation({ summary: '可疑提交列表（supervisor+）' })
  findAll(
    @Query('courseId') courseId?: string,
    @Query('contestId') contestId?: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.suspicionService.findAll({
      courseId: courseId ? parseInt(courseId, 10) : undefined,
      contestId: contestId ? parseInt(contestId, 10) : undefined,
      page: parseInt(page, 10) || 1,
      perPage: Math.min(parseInt(perPage, 10) || 20, 100),
    });
  }

  /**
   * GET /suspicion/export/:contestId
   * 导出 Excel（supervisor+）
   */
  @Get('export/:contestId')
  @ApiOperation({ summary: '导出可疑提交 Excel（supervisor+）' })
  async exportSus(
    @Param('contestId', ParseIntPipe) contestId: number,
    @Res() res: Response,
  ) {
    const buffer = await this.suspicionService.exportSus(contestId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sus-contest-${contestId}.csv"`,
    );
    res.send(buffer);
  }
}
