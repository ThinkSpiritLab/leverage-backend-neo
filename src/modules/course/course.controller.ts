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
import { CourseService } from './course.service'
import { CreateCourseDto } from './dto/create-course.dto'
import { UpdateCourseDto } from './dto/update-course.dto'
import { SubmissionService } from '../submission/submission.service'
import { CreateSubmissionDto } from '../submission/dto/create-submission.dto'

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CourseController {
  constructor(
    private readonly courseService: CourseService,
    private readonly submissionService: SubmissionService,
  ) {}

  /**
   * GET /courses — 列表
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '课程列表（分页）' })
  findAll(
    @Query('page') page: string = '1',
    @Query('perPage') perPage: string = '20',
    @Query('type') type?: string,
  ) {
    return this.courseService.findAll({
      page: parseInt(page),
      perPage: parseInt(perPage),
      type: type !== undefined ? parseInt(type) : undefined,
    })
  }

  /**
   * POST /courses — 创建（admin+）
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '创建课程' })
  create(@Body() dto: CreateCourseDto) {
    return this.courseService.create(dto)
  }

  /**
   * GET /courses/:id — 详情
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '课程详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.courseService.findOne(id)
  }

  /**
   * PATCH /courses/:id — 更新（admin+）
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '更新课程' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCourseDto) {
    return this.courseService.update(id, dto)
  }

  /**
   * DELETE /courses/:id — 删除（admin+）
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '删除课程' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.courseService.remove(id)
  }

  /**
   * POST /courses/:id/students — 添加学生（admin+）
   */
  @Post(':id/students')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '批量添加学生' })
  addStudents(
    @Param('id', ParseIntPipe) courseId: number,
    @Body() body: { userIds: number[] },
  ) {
    return this.courseService.addStudents(courseId, body.userIds)
  }

  /**
   * DELETE /courses/:id/students/:userId — 移除学生（admin+）
   */
  @Delete(':id/students/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '移除课程学生' })
  removeStudent(
    @Param('id', ParseIntPipe) courseId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.courseService.removeStudent(courseId, userId)
  }

  /**
   * GET /courses/:id/ranking — 课程排行榜
   */
  @Get(':id/ranking')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '课程排行榜' })
  getRanking(@Param('id', ParseIntPipe) courseId: number) {
    return this.courseService.getRanking(courseId)
  }

  /**
   * GET /courses/:id/submissions/export — 导出提交（按学号过滤）
   */
  @Get(':id/submissions/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  @ApiOperation({ summary: '课程提交导出（支持学号过滤，修复 #50）' })
  exportSubmissions(
    @Param('id', ParseIntPipe) courseId: number,
    @Query('filters') filtersText: string = '',
  ) {
    return this.courseService.exportSubmissions(courseId, filtersText)
  }

  /**
   * GET /courses/:id/submissions — 提交列表
   */
  @Get(':id/submissions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '课程提交列表' })
  getSubmissions(
    @Param('id', ParseIntPipe) courseId: number,
    @Query('page') page: string = '1',
    @Query('perPage') perPage: string = '20',
  ) {
    return this.submissionService.findAll({
      page: parseInt(page),
      perPage: parseInt(perPage),
      courseId,
    })
  }

  /**
   * POST /courses/:id/submissions — 课程提交
   */
  @Post(':id/submissions')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '课程内提交' })
  createSubmission(
    @Param('id', ParseIntPipe) courseId: number,
    @Body() dto: CreateSubmissionDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.submissionService.create(currentUser.sub, {
      ...dto,
      courseId,
      contestId: undefined,
    })
  }
}
