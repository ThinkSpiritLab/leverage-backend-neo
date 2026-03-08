import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt-access.strategy';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * GET /notifications/unread-count
   * 未读通知数（需要登录）
   */
  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取未读通知数' })
  getUnreadCount(@CurrentUser() user: JwtPayload) {
    return this.notificationService.getUnreadCount(user.sub);
  }

  /**
   * GET /notifications
   * 通知列表（公开）
   */
  @Get()
  @ApiOperation({ summary: '获取通知列表' })
  findAll(@Query('page') page?: string, @Query('perPage') perPage?: string) {
    return this.notificationService.findAll({
      page: page ? parseInt(page, 10) : 1,
      perPage: perPage ? parseInt(perPage, 10) : 10,
    });
  }

  /**
   * POST /notifications
   * 创建通知（admin+）
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建通知（admin+）' })
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationService.create(dto);
  }

  /**
   * PATCH /notifications/:id/read
   * 标记已读
   */
  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '标记通知已读' })
  async markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.notificationService.markRead(id, user.sub);
  }
}
