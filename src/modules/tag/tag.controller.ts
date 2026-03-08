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
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { TagService } from './tag.service'
import { CreateTagDto } from './dto/create-tag.dto'
import { UpdateTagDto } from './dto/update-tag.dto'

@ApiTags('tags')
@Controller('tags')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  /**
   * GET /tags
   * 获取所有标签（树形）
   */
  @Get()
  @ApiOperation({ summary: '获取所有标签（树形结构）' })
  findAll() {
    return this.tagService.findAll()
  }

  /**
   * POST /tags
   * 创建标签（需要 admin）
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建标签（需要 admin 权限）' })
  create(@Body() dto: CreateTagDto) {
    return this.tagService.create(dto)
  }

  /**
   * PATCH /tags/:id
   * 更新标签（需要 admin）
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新标签（需要 admin 权限）' })
  @ApiParam({ name: 'id', description: '标签 ID' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tagService.update(id, dto)
  }

  /**
   * DELETE /tags/:id
   * 删除标签（需要 admin）
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除标签（需要 admin 权限）' })
  @ApiParam({ name: 'id', description: '标签 ID' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.tagService.remove(id)
  }
}
