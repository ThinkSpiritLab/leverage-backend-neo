import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt-access.strategy';
import { SubmissionService } from './submission.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SubmissionQueryDto } from './dto/submission-query.dto';
import { SearchSubmissionDto } from './dto/search-submission.dto';
import { RejudgeDto } from './dto/rejudge.dto';
import { RequireLog } from '../log/log.decorator';

@ApiTags('submissions')
@Controller('submissions')
export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Get()
  @ApiOperation({
    summary: '提交列表（分页，支持 userId/problemId/status 过滤）',
  })
  findAll(@Query() query: SubmissionQueryDto) {
    return this.submissionService.findAll(query);
  }

  /**
   * GET /submissions/export — 按条件导出提交记录 CSV（最多5000条，需 admin）
   */
  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '按条件导出提交记录 CSV（admin）' })
  async exportCsv(@Query() query: SubmissionQueryDto, @Res() res: Response) {
    const buf = await this.submissionService.exportCsv(query);
    res.setHeader('Content-Disposition', 'attachment; filename=submissions.csv');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(buf);
  }

  @Get('count')
  @ApiOperation({ summary: '提交总数统计' })
  @ApiResponse({ status: 200, description: '返回提交总数（数字）' })
  count() {
    return this.submissionService.count();
  }

  @Get('ratio')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  @ApiBearerAuth()
  @ApiOperation({ summary: '通过率统计（按状态分组，需 supervisor+）' })
  @ApiQuery({ name: 'problemId', required: true, type: Number })
  @ApiQuery({ name: 'contestId', required: false, type: Number })
  @ApiQuery({ name: 'courseId', required: false, type: Number })
  getRatio(
    @Query('problemId', ParseIntPipe) problemId: number,
    @Query('contestId') contestId?: string,
    @Query('courseId') courseId?: string,
  ) {
    const cid = contestId !== undefined ? parseInt(contestId, 10) : false;
    const crid = courseId !== undefined ? parseInt(courseId, 10) : false;
    return this.submissionService.getProblemRatio(problemId, crid, cid);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分页搜索提交（带过滤条件）' })
  @ApiResponse({ status: 200, description: '返回 { items, total }' })
  search(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: SearchSubmissionDto,
    @Query('page') page?: string,
    @Query('contestId') contestId?: string,
    @Query('courseId') courseId?: string,
  ) {
    const cid = contestId !== undefined ? parseInt(contestId, 10) : false;
    const crid = courseId !== undefined ? parseInt(courseId, 10) : false;
    return this.submissionService.search(
      false,
      crid,
      cid,
      dto,
      parseInt(page ?? '1', 10) || 1,
    );
  }

  @Post('search-unlimited')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理员无限制搜索提交（需 supervisor+）' })
  @ApiResponse({ status: 200, description: '返回 { items, total }' })
  searchUnlimited(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: SearchSubmissionDto,
    @Query('page') page?: string,
  ) {
    return this.submissionService.search(
      true,
      false,
      false,
      dto,
      parseInt(page ?? '1', 10) || 1,
    );
  }

  @Post('rejudge-log')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重判日志查询（需 admin+）' })
  @ApiResponse({ status: 200, description: '返回 { items, total }' })
  searchRejudgeLog(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: SearchSubmissionDto,
    @Query('page') page?: string,
  ) {
    return this.submissionService.searchRejudgeLog(
      true,
      dto,
      parseInt(page ?? '1', 10) || 1,
    );
  }

  @Get('user-problem-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询用户对题目的提交状态（只能查自己）' })
  @ApiQuery({ name: 'userId', required: true, type: Number })
  @ApiQuery({ name: 'problemId', required: true, type: Number })
  @ApiQuery({ name: 'contestId', required: false, type: Number })
  @ApiQuery({ name: 'courseId', required: false, type: Number })
  @ApiResponse({ status: 200, description: '返回 UserProblemStatus 枚举值' })
  userProblemStatus(
    @CurrentUser() user: JwtPayload,
    @Query('userId', ParseIntPipe) userId: number,
    @Query('problemId', ParseIntPipe) problemId: number,
    @Query('contestId') contestId?: string,
    @Query('courseId') courseId?: string,
  ) {
    if (user.sub !== userId)
      throw new ForbiddenException('只能查询自己的提交状态');
    const cid = contestId !== undefined ? parseInt(contestId, 10) : null;
    const crid = courseId !== undefined ? parseInt(courseId, 10) : null;
    return this.submissionService.getUserProblemStatus(
      userId,
      problemId,
      crid,
      cid,
    );
  }

  @Get('user-problem-status/batch')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量查询用户对多题目的提交状态（只能查自己）' })
  @ApiQuery({ name: 'userId', required: true, type: Number })
  @ApiQuery({
    name: 'problemIds',
    required: true,
    description: '逗号分隔的题目 ID',
  })
  @ApiQuery({ name: 'contestId', required: false, type: Number })
  @ApiQuery({ name: 'courseId', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: '返回 { problemId: UserProblemStatus } 映射',
  })
  userProblemStatusBatch(
    @CurrentUser() user: JwtPayload,
    @Query('userId', ParseIntPipe) userId: number,
    @Query('problemIds') problemIdsStr: string,
    @Query('contestId') contestId?: string,
    @Query('courseId') courseId?: string,
  ) {
    if (user.sub !== userId)
      throw new ForbiddenException('只能查询自己的提交状态');
    if (!problemIdsStr) throw new BadRequestException('problemIds 不能为空');
    const problemIds = problemIdsStr
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    const cid = contestId !== undefined ? parseInt(contestId, 10) : null;
    const crid = courseId !== undefined ? parseInt(courseId, 10) : null;
    return this.submissionService.getUserProblemStatusBatch(
      userId,
      problemIds,
      crid,
      cid,
    );
  }

  @Post('batch-rejudge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @RequireLog('submission', 'batch-rejudge', true)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批量重判（需 admin+）' })
  @ApiQuery({
    name: 'count',
    required: false,
    type: Boolean,
    description: '仅返回数量不实际重判',
  })
  @ApiResponse({
    status: 200,
    description: '批量重判任务已触发，或返回匹配数量',
  })
  batchRejudge(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: RejudgeDto,
    @Query('count') count?: string,
  ) {
    return this.submissionService.batchRejudge(dto, !!count);
  }

  @Get('code-zip')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '下载代码 zip 包（需 admin+）' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'contestId', required: false, type: Number })
  @ApiQuery({ name: 'courseId', required: false, type: Number })
  @ApiQuery({ name: 'problemId', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  async getCodeZip(
    @Res() res: Response,
    @Query('userId') userId?: string,
    @Query('contestId') contestId?: string,
    @Query('courseId') courseId?: string,
    @Query('problemId') problemId?: string,
    @Query('take') take?: string,
  ) {
    res.setHeader('Content-Disposition', 'attachment; filename=code.zip');
    res.setHeader('Content-Type', 'application/x-zip-compressed');
    const arc = await this.submissionService.getCodeZip({
      userId: userId !== undefined ? parseInt(userId, 10) : undefined,
      contestId: contestId !== undefined ? parseInt(contestId, 10) : undefined,
      courseId: courseId !== undefined ? parseInt(courseId, 10) : undefined,
      problemId: problemId !== undefined ? parseInt(problemId, 10) : undefined,
      take: take !== undefined ? parseInt(take, 10) : undefined,
    });
    arc.pipe(res);
  }

  @Get('sus-recent')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '最近可疑提交列表（未处理，按评分降序，需 admin+）',
  })
  @ApiResponse({ status: 200, description: '返回最多 12 条可疑提交' })
  susRecent() {
    return this.submissionService.getRecentSus();
  }

  @Get('sus-union')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '按用户列表查重合并结果（需 admin+）' })
  @ApiQuery({
    name: 'users',
    required: false,
    description: '逗号分隔的用户 ID',
  })
  @ApiResponse({ status: 200, description: '返回 hashsum 交集的提交列表' })
  susUnion(@Query('users') users?: string) {
    if (!users) return [];
    const userIds = users
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    return this.submissionService.getSusUnion(...userIds);
  }

  @Get('sus-xlsx')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '导出查重结果 CSV（需 admin+）' })
  @ApiQuery({ name: 'contestId', required: false, type: Number })
  @ApiQuery({ name: 'courseId', required: false, type: Number })
  @ApiQuery({ name: 'problemId', required: false, type: Number })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  async getSusXlsx(
    @Res() res: Response,
    @Query('contestId') contestId?: string,
    @Query('courseId') courseId?: string,
    @Query('problemId') problemId?: string,
    @Query('userId') userId?: string,
    @Query('take') take?: string,
  ) {
    res.setHeader('Content-Disposition', 'attachment; filename=sus.csv');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const buf = await this.submissionService.getSusXlsx(
      contestId !== undefined ? parseInt(contestId, 10) : undefined,
      courseId !== undefined ? parseInt(courseId, 10) : undefined,
      problemId !== undefined ? parseInt(problemId, 10) : undefined,
      userId !== undefined ? parseInt(userId, 10) : undefined,
      take !== undefined ? parseInt(take, 10) : undefined,
    );
    res.send(buf);
  }

  @Get('sus/:hashsum')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '按 hashsum 查重复提交列表（需 admin+）' })
  @ApiParam({ name: 'hashsum', description: '代码 hashsum（SHA-1）' })
  @ApiResponse({ status: 200, description: '返回相同 hashsum 的提交列表' })
  susList(@Param('hashsum') hashsum: string) {
    return this.submissionService.getSusList(hashsum);
  }

  @Put('sus-checked/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '标记/取消标记查重已处理（需 admin+）' })
  @ApiParam({ name: 'id', description: '提交 ID' })
  @ApiResponse({ status: 200, description: '返回更新后的 Suspicion 记录' })
  checkSus(@Param('id', ParseIntPipe) submissionId: number) {
    return this.submissionService.checkSus(submissionId);
  }

  @Post('sus-test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '对代码字符串计算查重指标（需 admin+）' })
  @ApiResponse({ status: 200, description: '返回查重指标对象' })
  susTest(@Body('code') code: unknown) {
    if (typeof code !== 'string')
      throw new BadRequestException('code 必须是字符串');
    return this.submissionService.susTest(code);
  }

  @Get('ce/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取编译错误详情（自己或管理员）' })
  @ApiParam({ name: 'id', description: '提交 ID' })
  @ApiResponse({ status: 200, description: '返回提交详情（含编译错误信息）' })
  getCE(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const isAdmin = ['sa', 'admin', 'supervisor'].includes(user.role);
    return this.submissionService.getCE(id, user.sub, isAdmin);
  }

  @Post(':id/inspect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查看提交代码（自己或管理员）' })
  @ApiParam({ name: 'id', description: '提交 ID' })
  @ApiResponse({ status: 200, description: '返回提交 ID 和代码' })
  inspect(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const isAdmin = ['sa', 'admin', 'supervisor'].includes(user.role);
    return this.submissionService.inspect(id, user.sub, isAdmin);
  }

  @Post(':id/rejudge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重评单条（需要 admin 权限）' })
  @ApiParam({ name: 'id', description: '提交 ID' })
  async rejudge(@Param('id', ParseIntPipe) id: number) {
    await this.submissionService.rejudge(id);
    return { message: '重评任务已提交' };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除提交（需 admin+）' })
  @ApiParam({ name: 'id', description: '提交 ID' })
  @ApiResponse({ status: 200, description: '返回 { deleted: true }' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.submissionService.remove(id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: '轮询提交状态（从 Redis，快速响应）' })
  @ApiParam({ name: 'id', description: '提交 ID' })
  getStatus(@Param('id', ParseIntPipe) id: number) {
    return this.submissionService.getStatus(id);
  }

  @Get(':id')
  @ApiOperation({ summary: '提交详情（含评测结果）' })
  @ApiParam({ name: 'id', description: '提交 ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.submissionService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建提交（需要登录）' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSubmissionDto) {
    return this.submissionService.create(user.sub, dto);
  }
}
