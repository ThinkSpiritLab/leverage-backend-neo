import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../auth/strategies/jwt-access.strategy'
import { MediaService } from './media.service'

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * POST /media/upload
   * 上传文件（需要登录）
   */
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传文件（需要登录）' })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.mediaService.upload(file, user.sub)
  }

  /**
   * GET /media
   * 文件列表（admin+）
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取文件列表（admin+）' })
  findAll(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.mediaService.findAll({
      page: page ? parseInt(page, 10) : 1,
      perPage: perPage ? parseInt(perPage, 10) : 20,
    })
  }

  /**
   * GET /media/:id
   * 获取文件 URL（公开）
   */
  @Get(':id')
  @ApiOperation({ summary: '获取文件 URL' })
  getUrl(@Param('id') id: string) {
    return this.mediaService.getUrl(id)
  }

  /**
   * DELETE /media/:id
   * 删除文件（admin+）
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除文件（admin+）' })
  async remove(@Param('id') id: string) {
    await this.mediaService.remove(id)
  }
}
