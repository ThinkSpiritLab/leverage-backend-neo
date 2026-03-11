import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from './strategies/jwt-access.strategy';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth/api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建 API Key' })
  @ApiResponse({ status: 201, description: '创建成功，返回完整密钥（仅此一次）' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeyService.createApiKey(user.sub, dto.name);
  }

  @Get()
  @ApiOperation({ summary: '列出当前用户的 API Key' })
  @ApiResponse({ status: 200, description: '返回 API Key 列表（不含密钥）' })
  list(@CurrentUser() user: JwtPayload) {
    return this.apiKeyService.listApiKeys(user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '撤销 API Key' })
  @ApiResponse({ status: 204, description: '撤销成功' })
  @ApiResponse({ status: 404, description: 'API Key 不存在' })
  @ApiResponse({ status: 403, description: '无权操作' })
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.apiKeyService.revokeApiKey(user.sub, id);
  }
}
