import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt-access.strategy';
import { MessageService } from './message.service';
import { QueryMessageDto } from './dto/query-message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageStatusDto } from './dto/update-message-status.dto';

@ApiTags('messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  /**
   * GET /messages
   * 我的收件箱（分页，支持 read/unread 过滤）
   */
  @Get()
  @ApiOperation({ summary: '获取收件箱（分页）' })
  listInbox(
    @Query(new ValidationPipe({ transform: true })) query: QueryMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messageService.listInboxForUser(user.sub, query);
  }

  /**
   * GET /messages/count
   * 未读消息数
   */
  @Get('count')
  @ApiOperation({ summary: '获取未读消息数' })
  getUnreadCount(@CurrentUser() user: JwtPayload) {
    return this.messageService.getUnreadCount(user.sub);
  }

  /**
   * GET /messages/all
   * 所有消息（admin+）
   */
  @Get('all')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '获取所有消息（admin+）' })
  listAll(
    @Query(new ValidationPipe({ transform: true })) query: QueryMessageDto,
  ) {
    return this.messageService.listAllForAdmin(query);
  }

  /**
   * POST /messages/contact-admin
   * 联系管理员（给所有 admin 发消息）
   */
  @Post('contact-admin')
  @ApiOperation({ summary: '联系管理员' })
  contactAdmin(
    @Body(new ValidationPipe()) dto: SendMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messageService.contactAdmin(user.sub, dto.content);
  }

  /**
   * GET /messages/:id
   * 查询单条消息（含回复列表）
   */
  @Get(':id')
  @ApiOperation({ summary: '获取消息详情（含回复）' })
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.messageService.getOne(id);
  }

  /**
   * PUT /messages/:id/status
   * 更新消息状态（已读/未读/关闭/删除）
   */
  @Put(':id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '更新消息状态' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe()) dto: UpdateMessageStatusDto,
  ) {
    await this.messageService.updateStatus(id, dto.status);
  }

  /**
   * POST /messages/:id
   * 回复消息
   */
  @Post(':id')
  @ApiOperation({ summary: '回复消息' })
  replyMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe()) dto: SendMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.messageService.reply(id, user.sub, dto.content);
  }

  /**
   * GET /messages/:id/set-read
   * 标记会话为已读（简化接口）
   */
  @Get(':id/set-read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '标记会话为已读' })
  async setRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.messageService.setRead(user.sub, id);
  }
}
