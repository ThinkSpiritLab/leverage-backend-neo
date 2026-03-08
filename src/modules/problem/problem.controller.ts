import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/strategies/jwt-access.strategy'
import { ProblemService } from './problem.service'
import { CreateProblemDto } from './dto/create-problem.dto'
import { UpdateProblemDto } from './dto/update-problem.dto'
import { ProblemQueryDto } from './dto/problem-query.dto'

@ApiTags('problems')
@Controller('problems')
export class ProblemController {
  constructor(private readonly problemService: ProblemService) {}

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
    const isAdmin = user != null && (user.role === 'admin' || user.role === 'sa')
    return this.problemService.findAll(query, isAdmin)
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
    const isAdmin = user != null && (user.role === 'admin' || user.role === 'sa')
    return this.problemService.findOne(id, isAdmin)
  }

  /**
   * POST /problems
   * 创建题目（需要 admin）
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建题目（需要 admin 权限）' })
  async create(@Body() dto: CreateProblemDto) {
    return this.problemService.create(dto)
  }

  /**
   * PATCH /problems/:id
   * 更新题目（需要 admin）
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新题目（需要 admin 权限）' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProblemDto,
  ) {
    return this.problemService.update(id, dto)
  }

  /**
   * DELETE /problems/:id
   * 删除题目（需要 admin）
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除题目（需要 admin 权限）' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.problemService.remove(id)
  }

  /**
   * POST /problems/:id/test-data
   * 上传测试数据（需要 admin，必须 zip）
   */
  @Post(':id/test-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传测试数据（需要 admin 权限，必须为 .zip 文件）' })
  @ApiParam({ name: 'id', description: '题目 ID' })
  async uploadTestData(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.problemService.uploadTestData(id, file)
    return { message: '测试数据上传成功' }
  }
}
