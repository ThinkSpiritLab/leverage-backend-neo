import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SettingService } from './setting.service';
import { SetSettingDto } from './dto/set-setting.dto';

@ApiTags('settings')
@Controller('settings')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  /**
   * GET /settings/public
   * 公开配置（任何人均可访问）
   */
  @Get('public')
  @ApiOperation({ summary: '获取公开配置' })
  getPublic() {
    return this.settingService.getPublic();
  }

  /**
   * GET /settings
   * 所有配置列表（admin+）
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取所有配置（admin+）' })
  getAll() {
    return this.settingService.getAll();
  }

  /**
   * GET /settings/:key — 按 key 查单条（admin+）
   */
  @Get(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '按 key 获取单条配置（admin+）' })
  getOne(@Param('key') key: string) {
    return this.settingService.getOne(key);
  }

  /**
   * POST /settings
   * 设置配置（admin+）
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置配置（admin+）' })
  set(@Body() dto: SetSettingDto) {
    return this.settingService.set(dto.key, dto.value);
  }
}
