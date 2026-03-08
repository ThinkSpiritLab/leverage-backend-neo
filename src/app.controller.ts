import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { Roles } from './common/decorators/roles.decorator';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: '服务健康检查' })
  index(): string {
    return 'OK';
  }

  @Get('time')
  @ApiOperation({ summary: '服务器当前时间' })
  getTime() {
    return new Date();
  }

  @Get('stat')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('supervisor')
  @ApiOperation({ summary: '全局数据统计（supervisor+）' })
  getStat() {
    return this.appService.getStat();
  }
}
