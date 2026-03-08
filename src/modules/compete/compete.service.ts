import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Repository } from 'typeorm'
import type { Queue } from 'bull'
import * as path from 'path'
import * as fs from 'fs'
import { Game } from '../../database/entities/game.entity'
import { Gamer } from '../../database/entities/gamer.entity'
import { Match } from '../../database/entities/match.entity'
import { MatchGamerLink } from '../../database/entities/match-gamer-link.entity'
import { JUDGE_TX_QUEUE } from '../queue/queue.constants'
import { CreateGameDto } from './dto/create-game.dto'
import { UpdateGameDto } from './dto/update-game.dto'
import { CreateGamerDto } from './dto/create-gamer.dto'
import { UpdateGamerDto } from './dto/update-gamer.dto'

export enum MatchStatus {
  PENDING = 0,
  RUNNING = 1,
  FINISHED = 2,
  ERROR = 3,
}

export interface LeaderboardEntry {
  gamerId: number
  wins: number
  total: number
  winRate: number
}

export interface GameQuery {
  page?: number
  perPage?: number
}

export interface GamerQuery {
  gameId?: number
  userId?: number
  page?: number
  perPage?: number
}

export interface MatchQuery {
  gameId?: number
  gamerId?: number
  page?: number
  perPage?: number
}

@Injectable()
export class CompeteService {
  constructor(
    @InjectRepository(Game)
    private readonly gameRepo: Repository<Game>,
    @InjectRepository(Gamer)
    private readonly gamerRepo: Repository<Gamer>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(MatchGamerLink)
    private readonly matchGamerLinkRepo: Repository<MatchGamerLink>,
    @InjectQueue(JUDGE_TX_QUEUE)
    private readonly judgeTxQueue: Queue,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Game CRUD ───────────────────────────────────────────────────────────────

  async findAllGames(query: GameQuery): Promise<{ items: Game[]; total: number }> {
    const page = query.page ?? 1
    const perPage = Math.min(query.perPage ?? 20, 100)

    const [items, total] = await this.gameRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    })

    return { items, total }
  }

  async findOneGame(id: number): Promise<Game> {
    const game = await this.gameRepo.findOne({ where: { id } })
    if (!game) throw new NotFoundException(`游戏 #${id} 不存在`)
    return game
  }

  async createGame(dto: CreateGameDto): Promise<Game> {
    const game = this.gameRepo.create(dto)
    return this.gameRepo.save(game)
  }

  async updateGame(id: number, dto: UpdateGameDto): Promise<Game> {
    await this.findOneGame(id)
    await this.gameRepo.update(id, dto)
    return this.findOneGame(id)
  }

  async deleteGame(id: number): Promise<void> {
    await this.findOneGame(id)
    await this.gameRepo.delete(id)
  }

  /**
   * 上传游戏回放文件（zip）
   */
  async uploadGamePlayback(id: number, file: Express.Multer.File): Promise<void> {
    await this.findOneGame(id)

    const uploadDir = '/tmp/uploads/playback'
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    const filePath = path.join(uploadDir, `game-${id}-playback.zip`)
    fs.writeFileSync(filePath, file.buffer)
  }

  // ─── Gamer CRUD ──────────────────────────────────────────────────────────────

  async findAllGamers(query: GamerQuery): Promise<{ items: Gamer[]; total: number }> {
    const page = query.page ?? 1
    const perPage = Math.min(query.perPage ?? 20, 100)

    const qb = this.gamerRepo
      .createQueryBuilder('gamer')
      .leftJoinAndSelect('gamer.user', 'user')
      .leftJoinAndSelect('gamer.game', 'game')
      .orderBy('gamer.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)

    if (query.gameId !== undefined) {
      qb.andWhere('gamer.gameId = :gameId', { gameId: query.gameId })
    }
    if (query.userId !== undefined) {
      qb.andWhere('gamer.userId = :userId', { userId: query.userId })
    }

    const [items, total] = await qb.getManyAndCount()
    return { items, total }
  }

  async findOneGamer(id: number): Promise<Gamer> {
    const gamer = await this.gamerRepo.findOne({ where: { id }, relations: ['user', 'game'] })
    if (!gamer) throw new NotFoundException(`Bot 选手 #${id} 不存在`)
    return gamer
  }

  async createGamer(dto: CreateGamerDto, userId: number): Promise<Gamer> {
    // 验证游戏存在
    await this.findOneGame(dto.gameId)

    const gamer = this.gamerRepo.create({
      ...dto,
      userId,
    })
    return this.gamerRepo.save(gamer)
  }

  async updateGamer(id: number, dto: UpdateGamerDto, userId: number): Promise<Gamer> {
    const gamer = await this.findOneGamer(id)
    if (gamer.userId !== userId) {
      throw new BadRequestException('只能修改自己的 Bot')
    }
    await this.gamerRepo.update(id, dto)
    return this.findOneGamer(id)
  }

  // ─── Match ───────────────────────────────────────────────────────────────────

  /**
   * 发起对局
   */
  async launchMatch(gameId: number, gamerIds: number[]): Promise<Match> {
    const game = await this.gameRepo.findOneOrFail({ where: { id: gameId } })

    if (gamerIds.length !== game.gamerQuantity) {
      throw new BadRequestException(`游戏 ${game.title} 需要 ${game.gamerQuantity} 个参赛者`)
    }

    const gamers = await this.gamerRepo.find({
      where: { id: In(gamerIds) },
      select: ['id', 'code', 'language'],
    })
    if (gamers.length !== gamerIds.length) {
      throw new NotFoundException('部分参赛者不存在')
    }

    // 创建对局记录
    const match = await this.matchRepo.save({
      gameId,
      status: MatchStatus.PENDING,
    })

    // 推入评测队列
    await this.judgeTxQueue.add('compete', {
      matchId: match.id,
      game: {
        judgerCode: game.judgerCode,
        judgerLanguage: game.judgerLanguage,
        timeLimit: game.timeLimit,
        memoryLimit: game.memoryLimit,
      },
      gamers: gamers.map(g => ({ id: g.id, code: g.code, language: g.language })),
    })

    return match
  }

  async findAllMatches(query: MatchQuery): Promise<{ items: Match[]; total: number }> {
    const page = query.page ?? 1
    const perPage = Math.min(query.perPage ?? 20, 100)

    const qb = this.matchRepo
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.game', 'game')
      .orderBy('match.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)

    if (query.gameId !== undefined) {
      qb.andWhere('match.gameId = :gameId', { gameId: query.gameId })
    }

    const [items, total] = await qb.getManyAndCount()
    return { items, total }
  }

  async findOneMatch(id: number): Promise<Match> {
    const match = await this.matchRepo.findOne({
      where: { id },
      relations: ['game', 'links'],
    })
    if (!match) throw new NotFoundException(`对局 #${id} 不存在`)
    return match
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────────

  /**
   * 排行榜（胜率，不用 Elo）
   */
  async getLeaderboard(gameId: number): Promise<LeaderboardEntry[]> {
    // 验证游戏存在
    await this.findOneGame(gameId)

    const results = await this.dataSource
      .createQueryBuilder()
      .select('mgl.gamerId', 'gamerId')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN mgl.`index` = 1 THEN 1 ELSE 0 END)', 'wins')
      .from(MatchGamerLink, 'mgl')
      .innerJoin(Match, 'm', 'm.id = mgl.matchId AND m.gameId = :gameId', { gameId })
      .where('m.status = :status', { status: MatchStatus.FINISHED })
      .groupBy('mgl.gamerId')
      .orderBy('wins / total', 'DESC')
      .getRawMany()

    return results.map(r => ({
      gamerId: r.gamerId,
      wins: Number(r.wins),
      total: Number(r.total),
      winRate: r.total > 0 ? Number(r.wins) / Number(r.total) : 0,
    }))
  }
}
