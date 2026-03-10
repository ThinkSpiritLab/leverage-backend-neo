import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt-access.strategy';
import { CompeteService } from './compete.service';
import { HumanTurnService } from './human-turn.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { CreateGamerDto } from './dto/create-gamer.dto';
import { UpdateGamerDto } from './dto/update-gamer.dto';
import { LaunchMatchDto } from './dto/launch-match.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { SubmitGamerDto } from './dto/submit-gamer.dto';
import { ModifyPlayerDto } from './dto/modify-player.dto';
import { MatchCallbackDto } from './dto/match-callback.dto';

@ApiTags('compete')
@Controller('compete')
export class CompeteController {
  private readonly logger = new Logger(CompeteController.name);
  private readonly callbackToken: string;

  constructor(
    private readonly competeService: CompeteService,
    private readonly configService: ConfigService,
    private readonly humanTurnService: HumanTurnService,
  ) {
    this.callbackToken = this.configService.get<string>(
      'botzone.callbackToken',
      '',
    );
  }

  // ─── Games ──────────────────────────────────────────────────────────────────

  /**
   * GET /compete/games
   * 游戏列表（公开）
   */
  @Get('games')
  @ApiOperation({ summary: '游戏列表' })
  findAllGames(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.competeService.findAllGames({
      page: page ? parseInt(page, 10) : 1,
      perPage: perPage ? parseInt(perPage, 10) : 20,
    });
  }

  /**
   * GET /compete/games/:id/leaderboard
   * 排行榜（公开）
   */
  @Get('games/:id')
  @ApiOperation({ summary: '游戏详情' })
  findOneGame(@Param('id', ParseIntPipe) id: number) {
    return this.competeService.findOneGame(id);
  }

  @Get('games/:id/leaderboard')
  @ApiOperation({ summary: '排行榜（board=inner内榜code-only/outer外榜全部含标注，默认inner）' })
  getLeaderboard(
    @Param('id', ParseIntPipe) id: number,
    @Query('board') board?: string,
  ) {
    return this.competeService.getLeaderboard(id, board === 'outer' ? 'outer' : 'inner');
  }

  /**
   * POST /compete/games
   * 创建游戏（admin+）
   */
  @Post('games')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建游戏（admin+）' })
  createGame(@Body() dto: CreateGameDto) {
    return this.competeService.createGame(dto);
  }

  /**
   * PATCH /compete/games/:id
   * 更新游戏（admin+）
   */
  @Patch('games/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新游戏（admin+）' })
  updateGame(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGameDto,
  ) {
    return this.competeService.updateGame(id, dto);
  }

  /**
   * DELETE /compete/games/:id
   * 删除游戏（admin+）
   */
  @Delete('games/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除游戏（admin+）' })
  async deleteGame(@Param('id', ParseIntPipe) id: number) {
    await this.competeService.deleteGame(id);
  }

  /**
   * POST /compete/games/:id/playback
   * 上传回放文件（zip）（admin+）
   */
  @Post('games/:id/playback')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传游戏回放文件（zip）（admin+）' })
  async uploadPlayback(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.competeService.uploadGamePlayback(id, file);
    return { message: '上传成功' };
  }

  // ─── Gamers ──────────────────────────────────────────────────────────────────

  /**
   * GET /compete/gamers
   * Bot 列表（公开）
   */
  @Get('gamers')
  @ApiOperation({ summary: 'Bot 选手列表' })
  findAllGamers(
    @Query('gameId') gameId?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.competeService.findAllGamers({
      gameId: gameId ? parseInt(gameId, 10) : undefined,
      page: page ? parseInt(page, 10) : 1,
      perPage: perPage ? parseInt(perPage, 10) : 20,
    });
  }

  /**
   * POST /compete/gamers
   * 创建 Bot（需要登录）
   */
  @Post('gamers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建 Bot 选手（需要登录）' })
  createGamer(@Body() dto: CreateGamerDto, @CurrentUser() user: JwtPayload) {
    return this.competeService.createGamer(dto, user.sub);
  }

  /**
   * PATCH /compete/gamers/:id
   * 更新 Bot（本人）
   */
  @Get('gamers/:id')
  @ApiOperation({ summary: 'Bot 详情（含代码）' })
  findOneGamer(@Param('id', ParseIntPipe) id: number) {
    return this.competeService.findOneGamer(id);
  }

  @Get('gamers/:id/elo-history')
  @ApiOperation({ summary: 'Bot ELO 历史（最近100条）' })
  getEloHistory(@Param('id', ParseIntPipe) id: number) {
    return this.competeService.getEloHistory(id);
  }

  /**
   * POST /compete/gamers/:id/refresh-api-key
   * 刷新 external/human gamer 的 Bot API Key（7天有效）
   */
  @Post('gamers/:id/refresh-api-key')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '刷新 Bot API Key（external/human 类型）' })
  refreshBotApiKey(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.refreshBotApiKey(id, user.sub);
  }

  @Patch('gamers/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新 Bot（本人）' })
  updateGamer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGamerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.updateGamer(id, dto, user.sub);
  }

  /**
   * DELETE /compete/gamers/:id
   * 删除 Bot（有历史对局则软删除/禁用，否则硬删除）
   */
  @Delete('gamers/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除 Bot（有对局历史则禁用，否则彻底删除）' })
  deleteGamer(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.deleteGamer(id, user.sub);
  }

  // ─── Matches ─────────────────────────────────────────────────────────────────

  /**
   * POST /compete/matches
   * 发起对局（需要登录）
   */
  @Post('matches')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发起对局' })
  launchMatch(@Body() dto: LaunchMatchDto) {
    return this.competeService.launchMatch(dto.gameId, dto.gamerIds);
  }

  /**
   * GET /compete/matches
   * 对局列表（公开）
   */
  @Get('matches')
  @ApiOperation({ summary: '对局列表' })
  findAllMatches(
    @Query('gameId') gameId?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.competeService.findAllMatches({
      gameId: gameId ? parseInt(gameId, 10) : undefined,
      page: page ? parseInt(page, 10) : 1,
      perPage: perPage ? parseInt(perPage, 10) : 20,
    });
  }

  /**
   * GET /compete/matches/:id
   * 对局详情（公开）
   */
  @Get('matches/:id')
  @ApiOperation({ summary: '对局详情' })
  findOneMatch(@Param('id', ParseIntPipe) id: number) {
    return this.competeService.findOneMatch(id);
  }

  /**
   * POST /compete/matches/:id/inspect
   * 查看对局代码详情（需要登录）
   */
  @Post('matches/:id/inspect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '查看对局代码详情（含 gamer 代码）' })
  inspectMatch(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.inspectMatch(id, user.sub);
  }

  // ─── Match Callback ──────────────────────────────────────────────────────────

  /**
   * POST /compete/match-callback/:matchId
   * Botzone-neo 对局评测结果回调（仅限 botzone-neo 内部调用）
   *
   * Payload from botzone-neo (MatchResult):
   *   { scores: Record<string,number>, log: unknown[], compiles: CompileSummary[] }
   */
  @Post('match-callback/:matchId')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({ summary: 'botzone-neo 对局评测结果回调' })
  async receiveMatchCallback(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Headers('authorization') authHeader: string | undefined,
    @Query('token') tokenParam: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    this.assertCallbackToken(authHeader, tokenParam);

    const verdict = body.verdict as string | undefined;
    this.logger.log(`match-callback: matchId=${matchId} verdict=${verdict} scores=${JSON.stringify(body.scores)}`);

    // Forfeit = game void, no ELO update
    if (verdict === 'forfeit') {
      return this.competeService.handleMatchForfeit(matchId, body.forfeitedBot as string | undefined);
    }

    // botzone-neo MatchResult: { scores, log, compiles }
    const scores = body.scores as Record<string, number> | undefined;
    const log = body.log as unknown[] | undefined;

    return this.competeService.handleMatchCallbackByMatchId(matchId, scores, log);
  }

  /**
   * POST /compete/match-callback (legacy, kept for compatibility)
   */
  @Post('match-callback')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({ summary: 'botzone-neo 对局评测结果回调（legacy）' })
  async receiveMatchCallbackLegacy(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: MatchCallbackDto,
  ): Promise<{ ok: boolean }> {
    this.assertCallbackToken(authHeader);
    return this.competeService.handleMatchCallback(body.jobId, body.state, body.result);
  }

  /** Validate BOTZONE_CALLBACK_TOKEN bearer auth. */
  private assertCallbackToken(authHeader: string | undefined, queryToken?: string): void {
    if (!this.callbackToken) {
      this.logger.warn('BOTZONE_CALLBACK_TOKEN not set — match-callback is unprotected (dev mode)');
      return;
    }
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const token = headerToken ?? queryToken;
    if (token !== this.callbackToken) {
      throw new UnauthorizedException('Invalid callback token');
    }
  }

  // ─── Rooms ───────────────────────────────────────────────────────────────────

  /**
   * POST /compete/rooms
   * 创建房间（需要登录）
   */
  @Post('rooms')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建对战房间' })
  createRoom(@Body() dto: CreateRoomDto, @CurrentUser() user: JwtPayload) {
    const isAdmin = user.role === 'admin' || user.role === 'sa';
    return this.competeService.createRoom(dto, user.sub, isAdmin);
  }

  /**
   * GET /compete/rooms
   * 列出开放中的房间（公开）
   */
  @Get('rooms')
  @ApiOperation({ summary: '列出开放中的房间' })
  listOpenRooms() {
    return this.competeService.listOpenRooms();
  }

  /**
   * GET /compete/rooms/cooldown
   * 查询冷却时间（需要登录）
   */
  @Get('rooms/cooldown')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询创建房间冷却时间' })
  getRoomCooldown(@CurrentUser() user: JwtPayload) {
    return this.competeService.getRoomCooldown(user.sub);
  }

  /**
   * GET /compete/rooms/:id
   * 获取房间详情（公开）
   */
  @Get('rooms/:id')
  @ApiOperation({ summary: '获取房间详情' })
  getRoomOverview(@Param('id', ParseIntPipe) id: number) {
    return this.competeService.getRoomOverview(id);
  }

  /**
   * POST /compete/rooms/:id/submit
   * 在房间中提交 Bot（需要登录）
   */
  @Post('rooms/:id/submit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '在房间中提交 Bot 选手' })
  submitGamer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitGamerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.submitGamer(id, dto, user.sub);
  }

  /**
   * POST /compete/rooms/:id/start
   * 开始对局（需要登录）
   */
  @Post('rooms/:id/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '开始对局' })
  startRoom(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const isAdmin = user.role === 'admin' || user.role === 'sa';
    return this.competeService.startRoom(id, user.sub, isAdmin);
  }

  /**
   * PUT /compete/rooms/:id/open
   * 开放房间（需要登录）
   */
  @Put('rooms/:id/open')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '开放房间（允许其他人加入）' })
  openRoom(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.openRoom(id, user.sub);
  }

  /**
   * PUT /compete/rooms/:id/close
   * 关闭房间（需要登录）
   */
  @Put('rooms/:id/close')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '关闭房间（停止接受新加入）' })
  closeRoom(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.closeRoom(id, user.sub);
  }

  /**
   * PUT /compete/rooms/:id/player
   * 更新玩家（需要登录）
   */
  @Put('rooms/:id/player')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置房间位置的玩家' })
  modifyPlayer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifyPlayerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.modifyPlayer(id, dto, user.sub);
  }

  // ─── Auto Match ──────────────────────────────────────────────────────────

  /**
   * POST /compete/games/:id/trigger-auto-match
   * Admin: triggers round-robin auto-match among top-N ELO gamers.
   */
  @Post('games/:id/trigger-auto-match')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'sa')
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员：触发自动对局（top-N round-robin）' })
  triggerAutoMatch(
    @Param('id', ParseIntPipe) gameId: number,
    @Query('topN') topN?: string,
  ) {
    return this.competeService.triggerAutoMatch(gameId, topN ? Number(topN) : 8);
  }

  // ─── Human / External Bot Endpoints ──────────────────────────────────────

  /**
   * POST /compete/human-turn-webhook/:matchId/:gamerId
   * Called internally by botzone-neo (via WebhookRunner) when it's this gamer's turn.
   * Blocks until the human/external bot responds or times out (5 min).
   * Body: BotInput JSON
   */
  @Post('human-turn-webhook/:matchId/:gamerId')
  @SkipThrottle()
  @ApiOperation({ summary: '内部：botzone-neo 等待人类/外部bot输入（长轮询挂起）' })
  async humanTurnWebhook(
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('gamerId', ParseIntPipe) gamerId: number,
    @Body() gameState: unknown,
  ) {
    this.logger.log(`human-turn-webhook: matchId=${matchId} gamerId=${gamerId}`);
    const response = await this.humanTurnService.waitForResponse(matchId, gamerId, gameState, 300_000);
    // Return as plain text so botzone-neo's WebhookRunner gets it directly
    return response;
  }

  /**
   * GET /compete/bot-turn
   * Long-poll: external bot waits for its turn (returns after up to 30s).
   * Requires JWT auth; resolves the gamer ID from the token owner.
   * Query param: gamerId (required)
   */
  @Get('bot-turn')
  @SkipThrottle()
  @ApiOperation({ summary: '外部bot长轮询（JWT Bearer 或 X-Bot-Key header，最多30s）' })
  async botTurnPoll(
    @Query('gamerId') gamerIdStr?: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-bot-key') botKey?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    let gamerId: number;

    if (botKey) {
      // X-Bot-Key auth: look up gamer by api key
      const gamer = await this.competeService.findGamerByApiKey(botKey);
      if (!gamer) throw new UnauthorizedException('Bot API Key 无效或已过期');
      gamerId = gamer.id;
    } else if (user && gamerIdStr) {
      // JWT auth
      gamerId = parseInt(gamerIdStr, 10);
      if (isNaN(gamerId)) throw new UnauthorizedException('gamerId 无效');
      const gamer = await this.competeService.findOneGamer(gamerId);
      if (gamer.userId !== user.sub) throw new UnauthorizedException('非你的 Bot');
    } else {
      throw new UnauthorizedException('需要 Bearer token 或 X-Bot-Key');
    }

    const turn = await this.humanTurnService.waitForTurn(gamerId, 30_000);
    if (!turn) return { waiting: true };

    return {
      waiting: false,
      turnToken: turn.turnToken,
      gameState: turn.gameState,
      matchId: turn.matchId,
      gamerId: turn.gamerId,
    };
  }

  /**
   * POST /compete/bot-respond
   * Human or external bot submits their response.
   * Body: { turnToken: string, response: string }
   * Auth: Bearer JWT or X-Bot-Key header
   */
  @Post('bot-respond')
  @SkipThrottle()
  @ApiOperation({ summary: '提交移动（JWT 或 X-Bot-Key）' })
  async botRespond(
    @Body() body: { turnToken: string; response: string },
    @Headers('x-bot-key') botKey?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    // Auth: must have either bot key or JWT
    if (!botKey && !user) throw new UnauthorizedException('需要认证');
    if (botKey) {
      const gamer = await this.competeService.findGamerByApiKey(botKey);
      if (!gamer) throw new UnauthorizedException('Bot API Key 无效或已过期');
    }
    const ok = this.humanTurnService.submitResponse(body.turnToken, body.response);
    if (!ok) return { success: false, message: '找不到对应的 turn，可能已超时' };
    return { success: true };
  }

  /**
   * GET /compete/matches/:id/human-sse
   * SSE stream: notifies browser when it's the human player's turn.
   * Requires JWT. Only participants of the match can subscribe.
   */
  @Get('matches/:id/human-sse')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @SkipThrottle()
  @ApiOperation({ summary: '浏览器SSE：接收轮到玩家的推送通知' })
  humanSse(
    @Param('id', ParseIntPipe) matchId: number,
    @CurrentUser() user: JwtPayload,
    @Res() res: import('express').Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const writer = (data: string) => {
      res.write(`data: ${data}\n\n`);
    };
    this.humanTurnService.registerSSEClient(matchId, user.sub, writer);

    // Send keep-alive ping every 20s
    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { clearInterval(ping); }
    }, 20_000);

    res.on('close', () => {
      clearInterval(ping);
      this.humanTurnService.unregisterSSEClient(matchId, user.sub);
    });
  }
}
