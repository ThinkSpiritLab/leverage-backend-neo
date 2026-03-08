import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginContestDto } from './dto/login-contest.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import type { JwtPayload } from './strategies/jwt-access.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: '普通用户登录',
    description: '使用用户名/密码登录，返回 access + refresh token',
  })
  @ApiResponse({
    status: 200,
    description: '登录成功，返回 accessToken 和 refreshToken',
  })
  @ApiResponse({ status: 401, description: '用户名或密码错误' })
  async login(
    @Body() dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.authService.loginUser(dto.username, dto.password);
  }

  @Post('login/contest')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: '竞赛用户登录',
    description: '使用竞赛 ID + 用户名/密码登录，返回 contest access token',
  })
  @ApiResponse({ status: 200, description: '登录成功，返回 accessToken' })
  @ApiResponse({ status: 401, description: '认证失败' })
  async loginContest(
    @Body() dto: LoginContestDto,
  ): Promise<{ accessToken: string }> {
    return this.authService.loginContest(
      dto.contestId,
      dto.username,
      dto.password,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '刷新 Token',
    description: '使用 refresh token 换取新的 access token',
  })
  @ApiResponse({ status: 200, description: '返回新的 accessToken' })
  @ApiResponse({ status: 401, description: 'Refresh token 无效或已过期' })
  refresh(@Body() dto: RefreshDto): { accessToken: string } {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '登出',
    description: '清除客户端 token（服务端无状态，token 黑名单以后再实现）',
  })
  @ApiResponse({ status: 204, description: '登出成功' })
  logout(): void {
    // 目前无状态登出：客户端清除 token 即可
    // TODO: 实现 token 黑名单（Redis）
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '获取当前用户信息',
    description: '需要有效的 access token',
  })
  @ApiResponse({ status: 200, description: '返回当前用户的 JWT payload' })
  @ApiResponse({ status: 401, description: 'Token 无效或已过期' })
  getProfile(@CurrentUser() user: JwtPayload): JwtPayload & { id: number } {
    return { ...user, id: user.sub };
  }
}
