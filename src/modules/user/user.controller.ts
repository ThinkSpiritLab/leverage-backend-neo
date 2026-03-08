import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { JwtPayload } from '../auth/strategies/jwt-access.strategy'
import { UserService } from './user.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { UserQueryDto } from './dto/user-query.dto'
import { ImportUsersDto } from './dto/import-users.dto'
import { ChangePasswordDto } from './dto/change-password.dto'

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * GET /users — 列表（需要 supervisor+）
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  @ApiOperation({ summary: '用户列表（分页 + 搜索）' })
  findAll(@Query() query: UserQueryDto) {
    return this.userService.findAll(query)
  }

  /**
   * POST /users/import — 批量导入（需要 admin+）
   * 注意：必须在 :id 路由之前定义，否则 'import' 会被解析为 id
   */
  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '批量导入用户' })
  importUsers(@Body() dto: ImportUsersDto) {
    return this.userService.importUsers(dto.users)
  }

  /**
   * GET /users/:id — 详情
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '用户详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findOne(id)
  }

  /**
   * POST /users — 创建（需要 admin+）
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '创建用户' })
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto)
  }

  /**
   * PATCH /users/:id — 更新（需要 admin+，权限校验）
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '更新用户（权限校验）' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.userService.update(id, dto, currentUser.role)
  }

  /**
   * DELETE /users/:id — 删除（需要 admin+）
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '删除用户' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.userService.remove(id)
  }

  /**
   * POST /users/:id/password — 修改密码（本人或 admin+）
   */
  @Post(':id/password')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '修改密码（本人或 admin+）' })
  changePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangePasswordDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    // 只有本人或 admin+ 能修改密码
    const isAdmin = currentUser.role === 'sa' || currentUser.role === 'admin'
    if (currentUser.sub !== id && !isAdmin) {
      throw new ForbiddenException('只能修改自己的密码')
    }
    return this.userService.changePassword(id, dto)
  }

  /**
   * GET /users/:id/problem-status — 做题状态
   */
  @Get(':id/problem-status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '用户做题状态（从 Redis 读）' })
  getProblemStatus(
    @Param('id', ParseIntPipe) id: number,
    @Query('problemIds') problemIdsStr: string,
  ) {
    const problemIds = problemIdsStr
      ? problemIdsStr.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n))
      : []
    return this.userService.getUserProblemStatus(id, problemIds)
  }
}
