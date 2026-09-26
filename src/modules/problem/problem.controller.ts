import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt-access.strategy';
import { ProblemService } from './problem.service';
import { MAX_TESTCASE_ZIP_BYTES } from './testcase-archive';
import { CreateProblemDto } from './dto/create-problem.dto';
import { UpdateProblemDto } from './dto/update-problem.dto';
import { ProblemQueryDto } from './dto/problem-query.dto';
import { ZipHashDto } from './dto/zip-hash.dto';
import { AddTagDto } from './dto/add-tag.dto';
import { SimpExtraDto } from './dto/simp-extra.dto';
import { RequireLog } from '../log/log.decorator';

@ApiTags('problems')
@Controller('problems')
export class ProblemController {
  constructor(private readonly problemService: ProblemService) {}

  // ─────────────────────────────────────────────────────────────────────
  // Static routes (defined before /:id to avoid routing conflicts)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * GET /problems/next-id
   * 获取下一个可用 problemId（logicId）
   */
  @Get('next-id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取下一个可用 logicId（需要 admin）' })
  @ApiQuery({ name: 'prefix', description: '题目前缀', example: 'p' })
  async getNextId(@Query('prefix') prefix: string) {
    if (!prefix) throw new BadRequestException('prefix 参数不能为空');
    return this.problemService.getNextId(prefix);
  }

  /**
   * GET /problems/logic
   * 按 logicId 查询题目（?prefix=p&logicId=1001）
   */
  @Get('logic')
  @ApiOperation({ summary: '按 prefix + logicId 查询题目' })
  @ApiQuery({ name: 'prefix', description: '题目前缀', example: 'p' })
  @ApiQuery({ name: 'logicId', description: '逻辑 ID', example: 1001 })
  async getOneByLogicId(
    @Query('prefix') prefix: string,
    @Query('logicId') logicIdStr: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!prefix || !logicIdStr)
      throw new BadRequestException('prefix 和 logicId 参数不能为空');
    const logicId = parseInt(logicIdStr, 10);
    if (isNaN(logicId)) throw new BadRequestException('logicId 必须为整数');
    const isAdmin =
      user != null && (user.role === 'admin' || user.role === 'sa');
    try {
      return await this.problemService.getOneByLogicId(
        prefix,
        logicId,
        isAdmin,
      );
    } catch {
      throw new NotFoundException();
    }
  }

  /**
   * GET /problems/digest-partial
   * 获取题目摘要列表（精简字段，用于选择器）
   */
  @Get('digest-partial')
  @ApiOperation({ summary: '获取题目摘要列表（分页 + 标签过滤）' })
  @ApiQuery({ name: 'page', required: false, description: '页码', example: 1 })
  @ApiQuery({
    name: 'tags',
    required: false,
    description: '标签 ID（逗号分隔）',
    example: '1,2',
  })
  @ApiQuery({ name: 'title', required: false, description: '标题搜索' })
  @ApiQuery({ name: 'todo', required: false, description: '只看未 AC 的题目' })
  async digestPartial(
    @Query('page') pageStr?: string,
    @Query('tags') tags?: string,
    @Query('title') title?: string,
    @Query('todo') todo?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const page = parseInt(pageStr ?? '1', 10) || 1;
    const tagIds = tags ? tags.split(',').map(Number).filter(Boolean) : [];
    const isAdmin =
      user != null && (user.role === 'admin' || user.role === 'sa');
    const todoOnly = !!todo;
    const userId = user?.sub;
    return this.problemService.digestPartial(
      page,
      12,
      tagIds,
      title,
      isAdmin,
      todoOnly,
      userId,
    );
  }

  /**
   * GET /problems/manage-partial
   * 管理员视角的题目列表（包含隐藏题目）
   */
  @Get('manage-partial')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员视角题目列表（含隐藏题目）' })
  @ApiQuery({ name: 'page', required: false, description: '页码', example: 1 })
  @ApiQuery({
    name: 'tags',
    required: false,
    description: '标签 ID（逗号分隔）',
  })
  @ApiQuery({ name: 'title', required: false, description: '标题搜索' })
  async managePartial(
    @Query('page') pageStr?: string,
    @Query('tags') tags?: string,
    @Query('title') title?: string,
  ) {
    const page = parseInt(pageStr ?? '1', 10) || 1;
    const tagIds = tags ? tags.split(',').map(Number).filter(Boolean) : [];
    return this.problemService.managePartial(page, 12, tagIds, title);
  }

  /**
   * GET /problems/manage/available-digest
   * 管理员可用题目的摘要
   */
  @Get('manage/available-digest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员可用题目摘要（未关闭的题目）' })
  @ApiQuery({ name: 'page', required: false, description: '页码', example: 1 })
  async manageAvailableDigest(@Query('page') pageStr?: string) {
    const page = parseInt(pageStr ?? '1', 10) || 1;
    return this.problemService.manageAvailableDigest(page);
  }

  /**
   * POST /problems/import-fps
   * 从 FPS XML 格式导入题目（multipart/form-data）
   */
  @Post('import-fps')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '从 FPS XML 导入题目（需要 admin 权限）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        params: {
          type: 'string',
          description:
            'JSON string: { checkOnly, indices, prefix, source, restricted, closed, noMarkdown }',
        },
      },
    },
  })
  async importFps(
    @UploadedFile() file: Express.Multer.File,
    @Body('params') paramsStr: string,
  ) {
    if (!file) throw new BadRequestException('请上传 FPS XML 文件');
    let params: {
      checkOnly: boolean;
      indices: number[];
      prefix: string;
      source: string;
      restricted: boolean;
      closed: boolean;
      noMarkdown: boolean;
    };
    try {
      params = JSON.parse(paramsStr) as typeof params;
    } catch {
      throw new BadRequestException('params 必须是合法 JSON');
    }
    return this.problemService.importFps(file.buffer, params);
  }

  /**
   * POST /problems/simp-extra
   * 快速创建题目骨架
   */
  @Post('simp-extra')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '快速创建题目骨架（需要 admin 权限）' })
  async simpExtra(@Body() dto: SimpExtraDto, @CurrentUser() user: JwtPayload) {
    return this.problemService.simpCreateExtra(
      dto.title,
      dto.prefix ?? 'p',
      user.sub,
    );
  }

  /**
   * POST /problems/batch-zip-hash
   * 批量获取测试数据 zip 的 hash（用于校验）
   */
  @Post('batch-zip-hash')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量生成测试数据 zip hash（需要 admin 权限）' })
  async batchZipHash(@Body() dto: ZipHashDto) {
    return this.problemService.manuallyZipHashTestCase(dto);
  }

  /**
   * GET /problems/course-problem-list/:courseId
   * 获取课程的题目列表
   */
  @Get('course-problem-list/:courseId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取课程的题目 ID 列表（需要 admin）' })
  @ApiParam({ name: 'courseId', description: '课程 ID' })
  async courseProblemList(@Param('courseId', ParseIntPipe) courseId: number) {
    return this.problemService.courseProblemList(courseId);
  }

  /**
   * GET /problems/contest-problem-list/:contestId
   * 获取竞赛的题目列表
   */
  @Get('contest-problem-list/:contestId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取竞赛的题目 ID 列表（需要 admin）' })
  @ApiParam({ name: 'contestId', description: '竞赛 ID' })
  async contestProblemList(
    @Param('contestId', ParseIntPipe) contestId: number,
  ) {
    return this.problemService.contestProblemList(contestId);
  }

  // ─────────────────────────────────────────────────────────────────────
  // General CRUD (existing endpoints)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * GET /problems
   * 题目列表（分页，非 admin 过滤 hidden）
   */
  @Get()
  @ApiOperation({ summary: '题目列表（分页，非 admin 过滤隐藏题目）' })
  async findAll(
    @Query() query: ProblemQueryDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    const isAdmin =
      user != null && (user.role === 'admin' || user.role === 'sa');
    return this.problemService.findAll(query, isAdmin);
  }

  /**
   * POST /problems
   * 创建题目（需要 admin）
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @RequireLog('problem', 'create', true)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建题目（需要 admin 权限）' })
  async create(@Body() dto: CreateProblemDto) {
    return this.problemService.create(dto);
  }

  /**
   * GET /problems/:id
   * 题目详情
   */
  @Get(':id')
  @ApiOperation({ summary: '题目详情' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user?: JwtPayload,
  ) {
    const isAdmin =
      user != null && (user.role === 'admin' || user.role === 'sa');
    return this.problemService.findOne(id, isAdmin);
  }

  /**
   * PATCH /problems/:id
   * 更新题目（需要 admin）
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @RequireLog('problem', 'update', true)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新题目（需要 admin 权限）' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProblemDto,
  ) {
    return this.problemService.update(id, dto);
  }

  /**
   * DELETE /problems/:id
   * 删除题目（需要 admin）
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @RequireLog('problem', 'delete', true)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除题目（需要 admin 权限）' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.problemService.remove(id);
  }

  // ─────────────────────────────────────────────────────────────────────
  // /:id sub-routes
  // ─────────────────────────────────────────────────────────────────────

  /**
   * GET /problems/:id/ratio
   * 题目通过率（accepts/submits）
   */
  @Get(':id/ratio')
  @ApiOperation({ summary: '题目提交数/通过数统计' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async getRatio(@Param('id', ParseIntPipe) id: number) {
    return this.problemService.getProblemRatio(id);
  }

  /**
   * GET /problems/:id/refs
   * 题目被引用情况（在哪些竞赛/课程中使用）
   */
  @Get(':id/refs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '题目被引用情况（需要 admin）' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async refs(@Param('id', ParseIntPipe) id: number) {
    return this.problemService.refs(id);
  }

  /**
   * GET /problems/:id/tag
   * 获取题目标签列表
   */
  @Get(':id/tag')
  @ApiOperation({ summary: '获取题目标签列表' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async getTags(@Param('id', ParseIntPipe) id: number) {
    return this.problemService.getTags(id);
  }

  /**
   * POST /problems/:id/tag
   * 给题目添加标签（body: { tagId: number }）
   */
  @Post(':id/tag')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '给题目添加标签（需要 admin）' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async addTag(@Param('id', ParseIntPipe) id: number, @Body() dto: AddTagDto) {
    return this.problemService.addTag(id, dto.tagId);
  }

  /**
   * DELETE /problems/:id/tag/:tagId
   * 移除题目标签
   */
  @Delete(':id/tag/:tagId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '移除题目标签（需要 admin）' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  @ApiParam({ name: 'tagId', description: '标签 ID' })
  async removeTag(
    @Param('id', ParseIntPipe) id: number,
    @Param('tagId', ParseIntPipe) tagId: number,
  ) {
    return this.problemService.removeTag(id, tagId);
  }

  /**
   * GET /problems/:id/test-cases
   * 获取测试用例列表（文件名列表）
   */
  @Get(':id/test-cases')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取测试用例文件列表（需要 admin）' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async getTestCases(@Param('id', ParseIntPipe) id: number) {
    return this.problemService.getTestCasesFiles(id);
  }

  /**
   * POST /problems/:id/fork
   * 复制题目，自动分配下一个可用 logicId，admin+
   */
  @Post(':id/fork')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @RequireLog('problem', 'fork', true)
  @ApiBearerAuth()
  @ApiOperation({ summary: '复制题目（Fork），自动分配未使用的 logicId' })
  @ApiParam({ name: 'id', description: '源题目 ID' })
  async fork(@Param('id', ParseIntPipe) id: number) {
    return this.problemService.fork(id);
  }

  /**
   * POST /problems/:id/test-data
   * 上传测试数据（需要 admin，必须 zip）
   */
  @Post(':id/test-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @RequireLog('test-cases', 'upload', true)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_TESTCASE_ZIP_BYTES, files: 1 },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '上传测试数据（需要 admin 权限，必须为 .zip 文件）',
  })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async uploadTestData(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.problemService.uploadTestData(id, file);
    return { message: '测试数据上传成功' };
  }

  /**
   * GET /problems/:id/checker
   * 获取题目的 Special Judge checker 信息（需要 admin）
   */
  @Get(':id/checker')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取题目 SPJ Checker 信息（需要 admin）' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async getChecker(@Param('id', ParseIntPipe) id: number) {
    return this.problemService.getChecker(id);
  }

  /**
   * PATCH /problems/:id/checker
   * 更新题目的 Special Judge checker 代码和语言（需要 admin）
   */
  @Patch(':id/checker')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置题目 SPJ Checker 代码和语言（需要 admin）' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['checkerCode', 'checkerLanguage'],
      properties: {
        checkerCode: { type: 'string', description: 'Checker 源码' },
        checkerLanguage: {
          type: 'string',
          description: '语言（如 cpp17、c）',
        },
      },
    },
  })
  async setChecker(
    @Param('id', ParseIntPipe) id: number,
    @Body('checkerCode') checkerCode: string,
    @Body('checkerLanguage') checkerLanguage: string,
  ) {
    return this.problemService.setChecker(id, checkerCode, checkerLanguage);
  }
}
