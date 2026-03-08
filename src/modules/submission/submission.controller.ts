import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/strategies/jwt-access.strategy'
import { SubmissionService } from './submission.service'
import { CreateSubmissionDto } from './dto/create-submission.dto'
import { SubmissionQueryDto } from './dto/submission-query.dto'

@ApiTags('submissions')
@Controller('submissions')
export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  /**
   * GET /submissions
   * 列表（分页，支持 userId/problemId/status 过滤）
   */
  @Get()
  @ApiOperation({ summary: '提交列表（分页，支持 userId/problemId/status 过滤）' })
  findAll(@Query() query: SubmissionQueryDto) {
    return this.submissionService.findAll(query)
  }

  /**
   * GET /submissions/:id
   * 详情（含 judge result）
   */
  @Get(':id')
  @ApiOperation({ summary: '提交详情（含评测结果）' })
  @ApiParam({ name: 'id', description: '提交 ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.submissionService.findOne(id)
  }

  /**
   * POST /submissions
   * 创建提交（需要登录）
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建提交（需要登录）' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSubmissionDto,
  ) {
    return this.submissionService.create(user.sub, dto)
  }

  /**
   * GET /submissions/:id/status
   * 轮询状态（从 Redis，快速响应）
   */
  @Get(':id/status')
  @ApiOperation({ summary: '轮询提交状态（从 Redis，快速响应）' })
  @ApiParam({ name: 'id', description: '提交 ID' })
  getStatus(@Param('id', ParseIntPipe) id: number) {
    return this.submissionService.getStatus(id)
  }

  /**
   * POST /submissions/:id/rejudge
   * 重评（需要 supervisor 权限）
   */
  @Post(':id/rejudge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重评（需要 supervisor 权限）' })
  @ApiParam({ name: 'id', description: '提交 ID' })
  async rejudge(@Param('id', ParseIntPipe) id: number) {
    await this.submissionService.rejudge(id)
    return { message: '重评任务已提交' }
  }
}
