import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { Queue } from 'bull';
import * as path from 'path';
import * as fs from 'fs';
import { randomInt } from 'crypto';
import { Game } from '../../database/entities/game.entity';
import { Gamer } from '../../database/entities/gamer.entity';
import { Match } from '../../database/entities/match.entity';
import { MatchGamerLink } from '../../database/entities/match-gamer-link.entity';
import { JUDGE_TX_QUEUE } from '../queue/queue.constants';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { CreateGamerDto } from './dto/create-gamer.dto';
import { UpdateGamerDto } from './dto/update-gamer.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { SubmitGamerDto } from './dto/submit-gamer.dto';
import { ModifyPlayerDto } from './dto/modify-player.dto';
import { RedisService } from '../redis/redis.service';
import { SettingService } from '../setting/setting.service';

export enum MatchStatus {
  PENDING = 0,
  RUNNING = 1,
  FINISHED = 2,
  ERROR = 3,
}

export interface LeaderboardEntry {
  gamerId: number;
  wins: number;
  total: number;
  winRate: number;
}

export interface GameQuery {
  page?: number;
  perPage?: number;
}

export interface GamerQuery {
  gameId?: number;
  userId?: number;
  page?: number;
  perPage?: number;
}

export interface MatchQuery {
  gameId?: number;
  gamerId?: number;
  page?: number;
  perPage?: number;
}

// ─── Room 类型声明 ────────────────────────────────────────────────────────────

export interface RoomInfo {
  id: number;
  owner: { id: number; username: string };
  game: {
    id: number;
    title: string;
    timeLimit: number;
    memoryLimit: number;
    gamerQuantity: number;
    disabled: boolean;
  };
  createAt: number;
  open?: boolean;
}

export interface RoomOverview {
  info?: RoomInfo;
  submitters?: Record<string, any>;
  players?: Record<string, any>;
  matchId?: number;
}

export interface Submitter {
  gamer: any;
  user: any;
  message?: string;
}

@Injectable()
export class CompeteService {
  private readonly logger = new Logger(CompeteService.name);

  // ─── Room Redis keys ─────────────────────────────────────────────────────────
  private static readonly OPEN_ROOM_HASH = 'compete-open-room-hash';
  private static readonly ROOM_EXPIRE = 600;

  private infoKey(roomId: number) {
    return `room-info:${roomId}`;
  }
  private submittedGamerKey(roomId: number) {
    return `submitted-gamer:${roomId}`;
  }
  private playersKey(roomId: number) {
    return `room-players:${roomId}`;
  }
  private roomStartKey(roomId: number) {
    return `room-start:${roomId}`;
  }

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
    private readonly redisService: RedisService,
    private readonly settingService: SettingService,
  ) {}

  // ─── Game CRUD ───────────────────────────────────────────────────────────────

  async findAllGames(
    query: GameQuery,
  ): Promise<{ items: Game[]; total: number }> {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 20, 100);

    const [items, total] = await this.gameRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    return { items, total };
  }

  async findOneGame(id: number): Promise<Game> {
    const game = await this.gameRepo.findOne({ where: { id } });
    if (!game) throw new NotFoundException(`游戏 #${id} 不存在`);
    return game;
  }

  async createGame(dto: CreateGameDto): Promise<Game> {
    const game = this.gameRepo.create(dto);
    return this.gameRepo.save(game);
  }

  async updateGame(id: number, dto: UpdateGameDto): Promise<Game> {
    await this.findOneGame(id);
    await this.gameRepo.update(id, dto);
    return this.findOneGame(id);
  }

  async deleteGame(id: number): Promise<void> {
    await this.findOneGame(id);
    await this.gameRepo.delete(id);
  }

  /**
   * 上传游戏回放文件（zip）
   */
  async uploadGamePlayback(
    id: number,
    file: Express.Multer.File,
  ): Promise<void> {
    await this.findOneGame(id);

    const uploadDir = '/tmp/uploads/playback';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, `game-${id}-playback.zip`);
    fs.writeFileSync(filePath, file.buffer);
  }

  // ─── Gamer CRUD ──────────────────────────────────────────────────────────────

  async findAllGamers(
    query: GamerQuery,
  ): Promise<{ items: Gamer[]; total: number }> {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 20, 100);

    const qb = this.gamerRepo
      .createQueryBuilder('gamer')
      .leftJoinAndSelect('gamer.user', 'user')
      .leftJoinAndSelect('gamer.game', 'game')
      .orderBy('gamer.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (query.gameId !== undefined) {
      qb.andWhere('gamer.gameId = :gameId', { gameId: query.gameId });
    }
    if (query.userId !== undefined) {
      qb.andWhere('gamer.userId = :userId', { userId: query.userId });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async findOneGamer(id: number): Promise<Gamer> {
    // Use QueryBuilder to force-load code (select:false column) alongside relations
    const gamer = await this.gamerRepo
      .createQueryBuilder('g')
      .addSelect('g.code') // force include select:false column
      .leftJoinAndSelect('g.user', 'user')
      .leftJoinAndSelect('g.game', 'game')
      .where('g.id = :id', { id })
      .getOne();
    if (!gamer) throw new NotFoundException(`Bot 选手 #${id} 不存在`);
    return gamer;
  }

  async createGamer(dto: CreateGamerDto, userId: number): Promise<Gamer> {
    // 验证游戏存在
    await this.findOneGame(dto.gameId);

    const gamer = this.gamerRepo.create({
      ...dto,
      userId,
    });
    return this.gamerRepo.save(gamer);
  }

  async updateGamer(
    id: number,
    dto: UpdateGamerDto,
    userId: number,
  ): Promise<Gamer> {
    const original = await this.findOneGamer(id);
    if (original.userId !== userId) {
      throw new BadRequestException('只能修改自己的 Bot');
    }

    // Fork：创建新版本，保留原记录以维护历史对局完整性
    const forked = this.gamerRepo.create({
      userId: original.userId,
      gameId: original.gameId,
      title: dto.title ?? original.title,
      language: dto.language ?? original.language,
      opensource: dto.opensource ?? original.opensource,
      code: dto.code ?? original.code,
    });
    return this.gamerRepo.save(forked);
  }

  // ─── Match ───────────────────────────────────────────────────────────────────

  /**
   * 发起对局
   */
  async launchMatch(gameId: number, gamerIds: number[]): Promise<Match> {
    const game = await this.gameRepo
      .createQueryBuilder('g')
      .addSelect('g.judgerCode')
      .addSelect('g.judgerLanguage')
      .where('g.id = :id', { id: gameId })
      .getOne();
    if (!game) throw new NotFoundException(`游戏 #${gameId} 不存在`);

    if (gamerIds.length !== game.gamerQuantity) {
      throw new BadRequestException(
        `游戏 ${game.title} 需要 ${game.gamerQuantity} 个参赛者`,
      );
    }

    const gamers = await this.gamerRepo.find({
      where: { id: In(gamerIds) },
      select: ['id', 'code', 'language'],
    });
    if (gamers.length !== gamerIds.length) {
      throw new NotFoundException('部分参赛者不存在');
    }

    // 创建对局记录
    const match = await this.matchRepo.save({
      gameId,
      status: MatchStatus.PENDING,
    });

    // 创建 gamer 参与记录（按 gamerIds 顺序确定 position index）
    await this.matchGamerLinkRepo.save(
      gamerIds.map((gamerId, index) => ({ matchId: match.id, gamerId, index })),
    );

    // 推入评测队列（带 positionMap 用于 ELO 回调映射）
    const positionToGamerId: Record<number, number> = {};
    gamerIds.forEach((id, index) => { positionToGamerId[index] = id; });

    await this.judgeTxQueue.add('compete', {
      matchId: match.id,
      positionToGamerId,
      game: {
        judgerCode: game.judgerCode,
        judgerLanguage: game.judgerLanguage,
        timeLimit: game.timeLimit,
        memoryLimit: game.memoryLimit,
      },
      gamers: gamerIds.map((id, index) => {
        const g = gamers.find(gm => gm.id === id)!;
        return { id: g.id, code: g.code, language: g.language, position: index };
      }),
    });

    return match;
  }

  async findAllMatches(
    query: MatchQuery,
  ): Promise<{ items: Match[]; total: number }> {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 20, 100);

    const qb = this.matchRepo
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.game', 'game')
      .orderBy('match.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (query.gameId !== undefined) {
      qb.andWhere('match.gameId = :gameId', { gameId: query.gameId });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async findOneMatch(id: number): Promise<Match> {
    const match = await this.matchRepo.findOne({
      where: { id },
      relations: ['game', 'links', 'links.gamer', 'links.gamer.user'],
    });
    if (!match) throw new NotFoundException(`对局 #${id} 不存在`);
    return match;
  }

  /**
   * 查看对局代码详情（含 gamer 代码）
   */
  async inspectMatch(matchId: number, _userId: number): Promise<any> {
    const match = await this.matchRepo.findOne({
      where: { id: matchId },
      relations: ['game'],
    });
    if (!match) throw new NotFoundException(`对局 #${matchId} 不存在`);

    const links = await this.matchGamerLinkRepo.find({ where: { matchId } });
    const gamerIds = links.map((l) => l.gamerId);

    const gamers = await this.gamerRepo
      .createQueryBuilder('gamer')
      .select([
        'gamer.id',
        'gamer.title',
        'gamer.language',
        'gamer.code',
        'gamer.userId',
      ])
      .where('gamer.id IN (:...ids)', {
        ids: gamerIds.length > 0 ? gamerIds : [0],
      })
      .getMany();

    const gamerMap = new Map(gamers.map((g) => [g.id, g]));

    return {
      match,
      participants: links.map((link) => ({
        index: link.index,
        gamerId: link.gamerId,
        gamer: gamerMap.get(link.gamerId),
      })),
    };
  }

  // ─── Match Callback ──────────────────────────────────────────────────────────

  /**
   * 处理 botzone-neo 对局评测回调
   *
   * - 幂等：已 FINISHED/ERROR 的对局直接返回 ok
   * - 仅 terminal 状态（finished/failed）落库
   * - 落库后更新各参赛 Gamer 的 ELO 分
   */
  async handleMatchCallback(
    jobId: string,
    state: string,
    result?: {
      verdict?: string;
      rounds?: Record<string, unknown>[];
      finalResult?: Record<string, number>;
    },
  ): Promise<{ ok: boolean }> {
    const match = await this.matchRepo.findOne({
      where: { externalJobId: jobId },
    });
    if (!match) {
      this.logger.warn(`match-callback: unknown jobId=${jobId}`);
      return { ok: false };
    }

    // Idempotency: already in a terminal state
    if (
      match.status === MatchStatus.FINISHED ||
      match.status === MatchStatus.ERROR
    ) {
      return { ok: true };
    }

    const terminalStates = new Set(['finished', 'failed']);
    if (!terminalStates.has(state)) {
      // Intermediate state — acknowledge but don't write
      return { ok: true };
    }

    const newStatus =
      state === 'finished' ? MatchStatus.FINISHED : MatchStatus.ERROR;

    const resultData = JSON.stringify({
      verdict: result?.verdict ?? null,
      roundCount: result?.rounds?.length ?? 0,
      finalResult: result?.finalResult ?? {},
    });

    await this.matchRepo.update(match.id, {
      status: newStatus,
      result: resultData,
    });

    // Update ELO scores for all participating gamers
    if (state === 'finished' && result?.finalResult) {
      await this.updateElo(result.finalResult);
    }

    return { ok: true };
  }

  /**
   * botzone-neo MatchResult callback: { scores, log, compiles }
   * scores: { [botId string]: number } — botId is gamer id
   */
  async handleMatchCallbackByMatchId(
    matchId: number,
    scores?: Record<string, number>,
    log?: unknown[],
  ): Promise<{ ok: boolean }> {
    // Update-only callbacks (round progress) have no scores — skip
    if (!scores || Object.keys(scores).length === 0) {
      return { ok: true };
    }

    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) {
      this.logger.warn(`match-callback: matchId=${matchId} not found`);
      return { ok: false };
    }

    if (match.status === MatchStatus.FINISHED || match.status === MatchStatus.ERROR) {
      return { ok: true }; // idempotent
    }

    // Translate position index ("0","1") → real gamerId via match_gamer_link
    const links = await this.matchGamerLinkRepo.find({ where: { matchId } });
    const positionToGamerId: Record<string, number> = {};
    links.forEach(l => { positionToGamerId[String(l.index)] = l.gamerId; });

    // Convert position-keyed scores to gamerId-keyed
    const gamerIdScores: Record<string, number> = {};
    if (scores) {
      for (const [posOrId, score] of Object.entries(scores)) {
        const gId = positionToGamerId[posOrId] ?? posOrId;
        gamerIdScores[String(gId)] = score;
      }
    }

    const resultData = JSON.stringify({
      verdict: 'OK',
      finalResult: gamerIdScores,
      roundCount: Array.isArray(log) ? log.length : 0,
      rounds: log ?? [],
    });

    await this.matchRepo.update(matchId, {
      status: MatchStatus.FINISHED,
      result: resultData,
    });

    if (Object.keys(gamerIdScores).length >= 2) {
      await this.updateElo(gamerIdScores);
    }

    return { ok: true };
  }

  /**
   * Pairwise ELO update (K=32) for all gamers in a finished match.
   * finalResult: { [gamerId string]: score }
   */
  private async updateElo(
    finalResult: Record<string, number>,
  ): Promise<void> {
    const K = 32;

    const gamerIds = Object.keys(finalResult)
      .map((k) => parseInt(k, 10))
      .filter((id) => !isNaN(id));

    if (gamerIds.length < 2) return;

    const gamers = await this.gamerRepo.findBy({ id: In(gamerIds) });
    if (gamers.length < 2) return;

    const eloMap = new Map<number, number>(gamers.map((g) => [g.id, g.elo]));
    const deltas = new Map<number, number>(gamerIds.map((id) => [id, 0]));

    // Pairwise update for every unique pair
    for (let i = 0; i < gamerIds.length; i++) {
      for (let j = i + 1; j < gamerIds.length; j++) {
        const idA = gamerIds[i];
        const idB = gamerIds[j];
        const eloA = eloMap.get(idA);
        const eloB = eloMap.get(idB);
        if (eloA === undefined || eloB === undefined) continue;

        const scoreA = finalResult[String(idA)] ?? 0;
        const scoreB = finalResult[String(idB)] ?? 0;

        const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
        const expectedB = 1 - expectedA;
        const actualA = scoreA > scoreB ? 1 : scoreA === scoreB ? 0.5 : 0;
        const actualB = 1 - actualA;

        deltas.set(idA, (deltas.get(idA) ?? 0) + K * (actualA - expectedA));
        deltas.set(idB, (deltas.get(idB) ?? 0) + K * (actualB - expectedB));
      }
    }

    // Apply accumulated deltas (floor at 0)
    await Promise.all(
      gamers.map((g) => {
        const delta = deltas.get(g.id) ?? 0;
        const newElo = Math.max(0, Math.round(g.elo + delta));
        return this.gamerRepo.update(g.id, { elo: newElo });
      }),
    );
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────────

  /**
   * 排行榜（胜率，不用 Elo）
   */
  async getLeaderboard(gameId: number): Promise<LeaderboardEntry[]> {
    // 验证游戏存在
    await this.findOneGame(gameId);

    const results = await this.dataSource
      .createQueryBuilder()
      .select('mgl.gamerId', 'gamerId')
      .addSelect('g.title', 'gamerName')
      .addSelect('g.elo', 'elo')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN mgl.`index` = 1 THEN 1 ELSE 0 END)', 'wins')
      .from(MatchGamerLink, 'mgl')
      .innerJoin(Match, 'm', 'm.id = mgl.matchId AND m.gameId = :gameId', {
        gameId,
      })
      .leftJoin(Gamer, 'g', 'g.id = mgl.gamerId')
      .where('m.status = :status', { status: MatchStatus.FINISHED })
      .groupBy('mgl.gamerId')
      .orderBy('g.elo', 'DESC')
      .getRawMany<{ gamerId: number; gamerName: string; elo: string; wins: string; total: string }>();

    return results.map((r) => ({
      gamerId: r.gamerId,
      name: r.gamerName,
      elo: Number(r.elo ?? 1200),
      wins: Number(r.wins),
      total: Number(r.total),
      winRate: Number(r.total) > 0 ? Number(r.wins) / Number(r.total) : 0,
    }));
  }

  // ─── Room ─────────────────────────────────────────────────────────────────────

  private async destroyRoom(roomId: number): Promise<void> {
    const client = this.redisService.getClient();
    await client
      .multi()
      .hdel(CompeteService.OPEN_ROOM_HASH, String(roomId))
      .del(this.infoKey(roomId))
      .del(this.submittedGamerKey(roomId))
      .del(this.playersKey(roomId))
      .exec();
  }

  private async getRoomInfo(roomId: number): Promise<RoomInfo> {
    const data = await this.redisService.get(this.infoKey(roomId));
    if (!data) throw new InternalServerErrorException('no such room');
    return JSON.parse(data) as RoomInfo;
  }

  private async checkOwnerOrFail(
    roomId: number,
    userId: number,
  ): Promise<RoomInfo> {
    const info = await this.getRoomInfo(roomId);
    if (info.owner.id !== userId) throw new ForbiddenException();
    return info;
  }

  /**
   * 创建房间
   */
  async createRoom(
    dto: CreateRoomDto,
    userId: number,
    isAdmin: boolean,
  ): Promise<{ roomId: number }> {
    const game = await this.gameRepo.findOne({
      where: { id: dto.gameId },
      select: [
        'id',
        'title',
        'timeLimit',
        'memoryLimit',
        'gamerQuantity',
        'disabled',
      ],
    });
    if (!game) throw new NotFoundException(`游戏 #${dto.gameId} 不存在`);
    if (game.disabled && !isAdmin) throw new NotFoundException();

    const userResult = await this.dataSource.query<
      { id: number; username: string }[]
    >('SELECT id, username FROM `user` WHERE id = ?', [userId]);
    const user = userResult[0];
    if (!user) throw new NotFoundException('用户不存在');

    const roomId = randomInt(10000000, 99999999);
    const roomInfo: RoomInfo = {
      id: roomId,
      owner: { id: user.id, username: user.username },
      game: {
        id: game.id,
        title: game.title,
        timeLimit: game.timeLimit,
        memoryLimit: game.memoryLimit,
        gamerQuantity: game.gamerQuantity,
        disabled: game.disabled,
      },
      createAt: Date.now(),
    };

    const client = this.redisService.getClient();
    const key = this.infoKey(roomId);
    await client
      .multi()
      .set(key, JSON.stringify(roomInfo))
      .expire(key, CompeteService.ROOM_EXPIRE)
      .exec();

    return { roomId };
  }

  /**
   * 列出开放中的房间
   */
  async listOpenRooms(): Promise<Record<string, string>> {
    return this.redisService.hgetall(CompeteService.OPEN_ROOM_HASH);
  }

  /**
   * 查询冷却时间（防止频繁创建房间）
   */
  async getRoomCooldown(userId: number): Promise<{
    nGameCreated: number;
    maxGame: number;
    time_remaining: number;
  }> {
    const raw = await this.redisService.get(`game:created:${userId}`);
    const nGameCreated = +(raw || 0);
    const maxGameStr = await this.settingService.get('game.maxCreateNo');
    const maxGame = +(maxGameStr || 3);
    const time_remaining =
      (await this.redisService.ttl(`game:created:${userId}`)) || 0;
    return { nGameCreated, maxGame, time_remaining };
  }

  /**
   * 获取房间详情
   */
  async getRoomOverview(roomId: number): Promise<RoomOverview> {
    const client = this.redisService.getClient();
    const key = this.infoKey(roomId);
    const submitterKey = this.submittedGamerKey(roomId);
    const playersKey = this.playersKey(roomId);

    try {
      const results = await client
        .multi()
        .get(key)
        .hgetall(submitterKey)
        .hgetall(playersKey)
        .hexists(CompeteService.OPEN_ROOM_HASH, String(roomId))
        .get(this.roomStartKey(roomId))
        .exec();

      if (!results) throw new InternalServerErrorException('no such room');

      const [infoRes, submittersRes, playersRes, openRes, startRes] = results;

      // 已开始的对局
      if (startRes && startRes[0] === null && startRes[1]) {
        return { matchId: parseInt(startRes[1] as string) };
      }

      if (!infoRes || infoRes[0] !== null || !infoRes[1]) {
        throw new InternalServerErrorException('no such room');
      }

      const info = JSON.parse(infoRes[1] as string) as RoomInfo;
      if (openRes && openRes[0] === null) {
        info.open = !!openRes[1];
      }

      const overview: RoomOverview = { info };
      if (submittersRes && submittersRes[0] === null && submittersRes[1]) {
        overview.submitters = submittersRes[1] as Record<string, any>;
      }
      if (playersRes && playersRes[0] === null && playersRes[1]) {
        overview.players = playersRes[1] as Record<string, any>;
      }

      return overview;
    } catch (err) {
      this.logger.error(err);
      await this.destroyRoom(roomId);
      throw new InternalServerErrorException('no such room');
    }
  }

  /**
   * 提交 Bot 到房间
   */
  async submitGamer(
    roomId: number,
    dto: SubmitGamerDto,
    userId: number,
  ): Promise<void> {
    const client = this.redisService.getClient();
    const isOpen = await client.hexists(
      CompeteService.OPEN_ROOM_HASH,
      String(roomId),
    );
    if (!isOpen) {
      await this.checkOwnerOrFail(roomId, userId);
    }

    const gamer = await this.gamerRepo.findOne({ where: { id: dto.gamerId } });
    if (!gamer) throw new NotFoundException(`Bot #${dto.gamerId} 不存在`);
    if (gamer.userId !== userId) throw new ForbiddenException();

    const userResult = await this.dataSource.query<
      { id: number; username: string }[]
    >('SELECT id, username FROM `user` WHERE id = ?', [userId]);
    const user = userResult[0];

    const submitterKey = this.submittedGamerKey(roomId);
    const data: Submitter = { gamer, user, message: dto.message };
    await client
      .multi()
      .hset(submitterKey, String(dto.gamerId), JSON.stringify(data))
      .expire(submitterKey, CompeteService.ROOM_EXPIRE)
      .exec();
  }

  /**
   * 开始对局
   */
  async startRoom(
    roomId: number,
    userId: number,
    isAdmin: boolean,
  ): Promise<Match> {
    // 检查每日限制
    if (!isAdmin) {
      const maxGameStr = await this.settingService.get('game.maxCreateNo');
      const maxGame = +(maxGameStr || 3);
      const nGameCreated = await this.redisService.incr(
        `game:created:${userId}`,
      );
      if (nGameCreated > maxGame) {
        const time_remaining = await this.redisService.ttl(
          `game:created:${userId}`,
        );
        throw new BadRequestException({
          error: 'exceed_max_create',
          message: `You have reached the maximum number of games you can start. time remaining: ${time_remaining}`,
          time: time_remaining,
        });
      }
      // TTL 到当天结束
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const client = this.redisService.getClient();
      await client.pexpireat(`game:created:${userId}`, endOfDay.getTime());
    }

    const info = await this.checkOwnerOrFail(roomId, userId);
    const client = this.redisService.getClient();
    const playersKey = this.playersKey(roomId);

    try {
      const players = await client.hgetall(playersKey);
      const gamerQuantity = info.game.gamerQuantity;
      const gamerIds: number[] = [];
      for (let i = 0; i < gamerQuantity; i++) {
        if (players[String(i)]) {
          const gamer = JSON.parse(players[String(i)]) as { id: number };
          gamerIds.push(gamer.id);
        } else {
          throw new BadRequestException(`位置 ${i} 还没有选手`);
        }
      }
      const match = await this.launchMatch(info.game.id, gamerIds);
      await client.setex(this.roomStartKey(roomId), 300, String(match.id));
      return match;
    } catch (err) {
      this.logger.error(err);
      throw err;
    } finally {
      await this.destroyRoom(roomId);
    }
  }

  /**
   * 开放房间
   */
  async openRoom(roomId: number, userId: number): Promise<number> {
    const roomInfo = await this.checkOwnerOrFail(roomId, userId);
    const s = JSON.stringify({
      id: roomInfo.id,
      gameId: roomInfo.game.id,
      gameTitle: roomInfo.game.title,
      ownerId: roomInfo.owner.id,
      ownerUserName: roomInfo.owner.username,
      gamerQuantity: roomInfo.game.gamerQuantity,
      createAt: roomInfo.createAt,
    });
    return this.redisService
      .getClient()
      .hset(CompeteService.OPEN_ROOM_HASH, String(roomId), s);
  }

  /**
   * 关闭房间
   */
  async closeRoom(roomId: number, userId: number): Promise<number> {
    await this.checkOwnerOrFail(roomId, userId);
    return this.redisService
      .getClient()
      .hdel(CompeteService.OPEN_ROOM_HASH, String(roomId));
  }

  /**
   * 更新房间玩家
   */
  async modifyPlayer(
    roomId: number,
    dto: ModifyPlayerDto,
    userId: number,
  ): Promise<Record<string, any>> {
    const roomInfo = await this.checkOwnerOrFail(roomId, userId);

    const gamer = await this.gamerRepo.findOne({ where: { id: dto.gamerId } });
    if (!gamer) throw new NotFoundException();
    if (gamer.gameId !== roomInfo.game.id) throw new ForbiddenException();

    const playersKey = this.playersKey(roomId);
    const client = this.redisService.getClient();
    const results = await client
      .multi()
      .hset(playersKey, String(dto.index), JSON.stringify(gamer))
      .hgetall(playersKey)
      .exec();

    if (results && results[1] && results[1][0] === null) {
      return results[1][1] as Record<string, any>;
    }
    throw new InternalServerErrorException();
  }
}
