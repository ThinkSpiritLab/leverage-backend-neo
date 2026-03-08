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
}
