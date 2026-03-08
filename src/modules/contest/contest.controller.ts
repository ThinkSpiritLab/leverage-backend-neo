import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { JwtPayload } from '../auth/strategies/jwt-access.strategy'
import { ContestService } from './contest.service'
import { CreateContestDto } from './dto/create-contest.dto'
import { UpdateContestDto } from './dto/update-contest.dto'
import { ContestQueryDto } from './dto/contest-query.dto'
import { ContestUserDto, RegisterContestUserDto } from './dto/contest-user.dto'
import { CreateSubmissionDto } from '../submission/dto/create-submission.dto'
import { SubmissionService } from '../submission/submission.service'

@ApiTags('contests')
@ApiBearerAuth()
@Controller('contests')
export class ContestController {
  constructor(
    private readonly contestService: ContestService,
    private readonly submissionService: SubmissionService,
  ) {}

  /**
   * GET /contests — 列表
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '竞赛列表（分页，支持状态过滤）' })
  findAll(@Query() query: ContestQueryDto) {
    return this.contestService.findAll(query)
  }

  /**
   * POST /contests — 创建（admin+）
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '创建竞赛' })
  create(@Body() dto: CreateContestDto) {
    return this.contestService.create(dto)
  }

  /**
   * GET /contests/:id — 详情
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '竞赛详情（含题目列表）' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contestService.findOne(id)
  }

  /**
   * PATCH /contests/:id — 更新（admin+）
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '更新竞赛' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContestDto) {
    return this.contestService.update(id, dto)
  }

  /**
   * DELETE /contests/:id — 删除（admin+）
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '删除竞赛' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contestService.remove(id)
  }

  /**
   * POST /contests/:id/users — 注册参赛（用户自行注册或 admin 导入）
   */
  @Post(':id/users')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '注册参赛（单个用户）' })
  registerUser(
    @Param('id', ParseIntPipe) contestId: number,
    @Body() dto: RegisterContestUserDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    // 普通用户只能注册自己
    const userId = dto.userId ?? currentUser.sub
    return this.contestService.registerUser(contestId, userId)
  }

  /**
   * POST /contests/:id/users/import — 批量导入参赛用户（admin+）
   */
  @Post(':id/users/import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '批量导入参赛用户（生成随机密码）' })
  importContestUsers(
    @Param('id', ParseIntPipe) contestId: number,
    @Body() body: { users: ContestUserDto[] },
  ) {
    return this.contestService.importContestUsers(contestId, body.users)
  }

  /**
   * GET /contests/:id/ranking — 排行榜（分页）
   */
  @Get(':id/ranking')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '竞赛排行榜（从 Redis Sorted Set 读）' })
  getRanking(
    @Param('id', ParseIntPipe) contestId: number,
    @Query('page') page: number = 1,
    @Query('perPage') perPage: number = 50,
  ) {
    return this.contestService.getRanking(contestId, +page, +perPage)
  }

  /**
   * GET /contests/:id/balloons — 气球列表（supervisor+）
   */
  @Get(':id/balloons')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  @ApiOperation({ summary: '气球列表（首次 AC 未送达的记录）' })
  getBalloons(@Param('id', ParseIntPipe) contestId: number) {
    return this.contestService.getBalloons(contestId)
  }

  /**
   * PATCH /contests/:id/balloons/:bid — 标记气球已送（supervisor+）
   */
  @Patch(':id/balloons/:bid')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  @ApiOperation({ summary: '标记气球已送达' })
  markBalloonDelivered(
    @Param('id', ParseIntPipe) _contestId: number,
    @Param('bid', ParseIntPipe) bid: number,
  ) {
    return this.contestService.markBalloonDelivered(bid)
  }

  /**
   * POST /contests/:id/submissions — 竞赛提交（需要 ContestUser JWT）
   */
  @Post(':id/submissions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '竞赛提交（contestId 自动注入）' })
  createSubmission(
    @Param('id', ParseIntPipe) contestId: number,
    @Body() dto: CreateSubmissionDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.submissionService.create(currentUser.sub, {
      ...dto,
      contestId,
      courseId: undefined,
    })
  }

  /**
   * GET /contests/:id/submissions — 竞赛提交列表
   */
  @Get(':id/submissions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '竞赛提交列表' })
  getSubmissions(
    @Param('id', ParseIntPipe) contestId: number,
    @Query('page') page: string = '1',
    @Query('perPage') perPage: string = '20',
  ) {
    return this.submissionService.findAll({ page: parseInt(page), perPage: parseInt(perPage), contestId })
  }
}
