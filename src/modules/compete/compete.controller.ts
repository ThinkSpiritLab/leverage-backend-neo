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
  Put,
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
import type { JwtPayload } from '../auth/strategies/jwt-access.strategy'
import { CompeteService } from './compete.service'
import { CreateGameDto } from './dto/create-game.dto'
import { UpdateGameDto } from './dto/update-game.dto'
import { CreateGamerDto } from './dto/create-gamer.dto'
import { UpdateGamerDto } from './dto/update-gamer.dto'
import { LaunchMatchDto } from './dto/launch-match.dto'
import { CreateRoomDto } from './dto/create-room.dto'
import { SubmitGamerDto } from './dto/submit-gamer.dto'
import { ModifyPlayerDto } from './dto/modify-player.dto'

@ApiTags('compete')
@Controller('compete')
export class CompeteController {
  constructor(private readonly competeService: CompeteService) {}

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
    })
  }

  /**
   * GET /compete/games/:id/leaderboard
   * 排行榜（公开）
   */
  @Get('games/:id/leaderboard')
  @ApiOperation({ summary: '游戏排行榜（胜率）' })
  getLeaderboard(@Param('id', ParseIntPipe) id: number) {
    return this.competeService.getLeaderboard(id)
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
    return this.competeService.createGame(dto)
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
    return this.competeService.updateGame(id, dto)
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
    await this.competeService.deleteGame(id)
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
    await this.competeService.uploadGamePlayback(id, file)
    return { message: '上传成功' }
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
    })
  }

  /**
   * POST /compete/gamers
   * 创建 Bot（需要登录）
   */
  @Post('gamers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建 Bot 选手（需要登录）' })
  createGamer(
    @Body() dto: CreateGamerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.createGamer(dto, user.sub)
  }

  /**
   * PATCH /compete/gamers/:id
   * 更新 Bot（本人）
   */
  @Patch('gamers/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新 Bot（本人）' })
  updateGamer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGamerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.updateGamer(id, dto, user.sub)
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
    return this.competeService.launchMatch(dto.gameId, dto.gamerIds)
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
    })
  }

  /**
   * GET /compete/matches/:id
   * 对局详情（公开）
   */
  @Get('matches/:id')
  @ApiOperation({ summary: '对局详情' })
  findOneMatch(@Param('id', ParseIntPipe) id: number) {
    return this.competeService.findOneMatch(id)
  }

  /**
   * POST /compete/matches/:id/inspect
   * 查看对局代码详情（需要登录）
   */
  @Post('matches/:id/inspect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查看对局代码详情（含 gamer 代码）' })
  inspectMatch(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.inspectMatch(id, user.sub)
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
  createRoom(
    @Body() dto: CreateRoomDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const isAdmin = user.role === 'admin' || user.role === 'sa'
    return this.competeService.createRoom(dto, user.sub, isAdmin)
  }

  /**
   * GET /compete/rooms
   * 列出开放中的房间（公开）
   */
  @Get('rooms')
  @ApiOperation({ summary: '列出开放中的房间' })
  listOpenRooms() {
    return this.competeService.listOpenRooms()
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
    return this.competeService.getRoomCooldown(user.sub)
  }

  /**
   * GET /compete/rooms/:id
   * 获取房间详情（公开）
   */
  @Get('rooms/:id')
  @ApiOperation({ summary: '获取房间详情' })
  getRoomOverview(@Param('id', ParseIntPipe) id: number) {
    return this.competeService.getRoomOverview(id)
  }

  /**
   * POST /compete/rooms/:id/submit
   * 在房间中提交 Bot（需要登录）
   */
  @Post('rooms/:id/submit')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '在房间中提交 Bot 选手' })
  @HttpCode(HttpStatus.OK)
  submitGamer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitGamerDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.competeService.submitGamer(id, dto, user.sub)
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
    const isAdmin = user.role === 'admin' || user.role === 'sa'
    return this.competeService.startRoom(id, user.sub, isAdmin)
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
    return this.competeService.openRoom(id, user.sub)
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
    return this.competeService.closeRoom(id, user.sub)
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
    return this.competeService.modifyPlayer(id, dto, user.sub)
  }
}
