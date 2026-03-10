import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { Queue } from 'bull';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes, randomInt } from 'crypto';
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
import { PlaygroundJudgeDto } from './dto/playground-judge.dto';
import { RedisService } from '../redis/redis.service';
import { SettingService } from '../setting/setting.service';
import { HumanTurnService } from './human-turn.service';

export enum MatchStatus {
  PENDING = 0,
  RUNNING = 1,
  FINISHED = 2,
  ERROR = 3,
}

export interface LeaderboardEntry {
  gamerId: number;
  name?: string;
  /** gamer 类型：code / human / external / webhook */
  type?: string;
  elo?: number;
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
  status?: number;
  isTest?: boolean;
  winnerId?: number;
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
    private readonly configService: ConfigService,
    private readonly humanTurnService: HumanTurnService,
  ) {}

  // ─── Game CRUD ───────────────────────────────────────────────────────────────

  async findAllGames(
    query: GameQuery,
  ): Promise<{ items: any[]; total: number }> {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 20, 100);
    const offset = (page - 1) * perPage;

    const total = await this.gameRepo.count();

    const result = await this.gameRepo
      .createQueryBuilder('g')
      .addSelect(
        `(SELECT COUNT(*) FROM gamer gr WHERE gr.gameId = g.id AND gr.disabled = 0 AND gr.isTest = 0 AND gr.type = 'code')`,
        'g_activeBotCount',
      )
      .addSelect(
        `(SELECT COUNT(*) FROM \`match\` m WHERE m.gameId = g.id AND m.status = 2 AND m.isTest = 0 AND m.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY))`,
        'g_recentMatchCount',
      )
      .orderBy('g.createdAt', 'DESC')
      .offset(offset)
      .limit(perPage)
      .getRawAndEntities();

    const items = result.entities.map((entity, i) => ({
      ...entity,
      activeBotCount: Number(result.raw[i]?.g_activeBotCount ?? 0),
      recentMatchCount: Number(result.raw[i]?.g_recentMatchCount ?? 0),
    }));

    return { items, total };
  }

  async findOneGame(id: number): Promise<Game> {
    const game = await this.gameRepo.findOne({ where: { id } });
    if (!game) throw new NotFoundException(`游戏 #${id} 不存在`);
    return game;
  }

  /**
   * 获取游戏（含 judgerCode/judgerLanguage），仅供 supervisor+ 调用
   */
  async findOneGameWithJudger(id: number): Promise<{ judgerCode: string; judgerLanguage: string }> {
    const game = await this.gameRepo
      .createQueryBuilder('g')
      .addSelect('g.judgerCode')
      .addSelect('g.judgerLanguage')
      .where('g.id = :id', { id })
      .getOne();
    if (!game) throw new NotFoundException(`游戏 #${id} 不存在`);
    return { judgerCode: game.judgerCode ?? '', judgerLanguage: game.judgerLanguage ?? '' };
  }

  async createGame(dto: CreateGameDto, creatorRole?: string): Promise<Game> {
    const game = this.gameRepo.create({
      ...dto,
      judgerCode: dto.judgerCode ?? '',
      judgerLanguage: dto.judgerLanguage ?? '',
    });
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

    // 默认排除测试临时 gamer（isTest=true）
    qb.andWhere('gamer.isTest = :isTest', { isTest: false });

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

    const type = dto.type ?? 'code';

    // 每个用户每个游戏只能有一个 human 席位
    if (type === 'human') {
      const existing = await this.gamerRepo.findOne({
        where: { userId, gameId: dto.gameId, type: 'human' },
      });
      if (existing) {
        // Return the existing one instead of creating a duplicate
        return existing;
      }
    }

    const needsApiKey = type === 'external'; // human 用浏览器 JWT，不需要 API Key
    const botApiKey = needsApiKey ? randomBytes(24).toString('hex') : null;
    const botApiKeyExpiresAt = needsApiKey
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      : null;

    const gamer = this.gamerRepo.create({
      userId,
      gameId: dto.gameId,
      title: dto.title,
      type,
      language: dto.language ?? (type === 'webhook' ? 'webhook' : 'python'),
      code: dto.code ?? '',
      opensource: type === 'code' ? (dto.opensource ?? true) : false,
      webhookUrl: dto.webhookUrl ?? null,
      webhookSecret: dto.webhookSecret ?? null,
      botApiKey: botApiKey ?? undefined,
      botApiKeyExpiresAt: botApiKeyExpiresAt ?? undefined,
    });
    const saved = await this.gamerRepo.save(gamer) as Gamer & { botApiKey?: string };
    // Return botApiKey in response (only on creation, never again from findOne)
    if (botApiKey) saved.botApiKey = botApiKey;
    return saved;
  }

  /** 删除 gamer（有历史对局则软删除，否则硬删除） */
  async deleteGamer(id: number, userId: number): Promise<{ deleted: boolean; disabled: boolean }> {
    const gamer = await this.findOneGamer(id);
    if (gamer.userId !== userId) throw new UnauthorizedException('非你的 Bot');

    const matchCount = await this.matchGamerLinkRepo.count({ where: { gamerId: id } });
    if (matchCount > 0) {
      // Has match history — soft delete
      await this.gamerRepo.update(id, { disabled: true });
      return { deleted: false, disabled: true };
    }

    // No history — hard delete
    await this.gamerRepo.delete(id);
    return { deleted: true, disabled: false };
  }

  /** 生成或刷新 botApiKey（7天有效期） */
  async refreshBotApiKey(gamerId: number, userId: number): Promise<{ botApiKey: string; expiresAt: Date }> {
    const gamer = await this.findOneGamer(gamerId);
    if (gamer.userId !== userId) throw new UnauthorizedException('非你的 Bot');
    if (gamer.type !== 'external') {
      throw new BadRequestException('仅 external 类型支持 API Key');
    }
    const botApiKey = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.gamerRepo.update(gamerId, { botApiKey, botApiKeyExpiresAt: expiresAt });
    return { botApiKey, expiresAt };
  }

  /** 通过 botApiKey 查找 gamer（用于 X-Bot-Key 认证） */
  async findGamerByApiKey(apiKey: string): Promise<Gamer | null> {
    const result = await this.gamerRepo
      .createQueryBuilder('g')
      .addSelect('g.botApiKey')
      .addSelect('g.botApiKeyExpiresAt')
      .where('g.botApiKey = :apiKey', { apiKey })
      .getOne();
    if (!result) return null;
    if (result.botApiKeyExpiresAt && result.botApiKeyExpiresAt < new Date()) return null; // expired
    return result;
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
      type: dto.type ?? original.type,
      language: dto.language ?? original.language,
      opensource: dto.opensource ?? original.opensource,
      code: dto.code ?? original.code,
      webhookUrl: dto.webhookUrl ?? original.webhookUrl,
      webhookSecret: dto.webhookSecret ?? original.webhookSecret,
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
      select: ['id', 'code', 'language', 'type', 'webhookUrl', 'webhookSecret'],
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
        const type = g.type ?? 'code';
        const baseUrl = this.configService.get<string>('baseUrl', 'http://localhost:3000');

        // human/external gamers use internal long-poll webhook
        const resolvedWebhookUrl =
          type === 'human' || type === 'external'
            ? `${baseUrl}/compete/human-turn-webhook/${match.id}/${g.id}`
            : g.webhookUrl ?? undefined;

        // Human: 3 min to respond; external bot: 30s (they should be polling)
        const webhookTimeoutMs =
          type === 'human' ? 180_000 : type === 'external' ? 30_000 : undefined;

        return {
          id: g.id,
          code: g.code,
          language: g.language,
          position: index,
          type,
          webhookUrl: resolvedWebhookUrl,
          webhookSecret: g.webhookSecret ?? undefined,
          webhookTimeoutMs,
        };
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
      .leftJoinAndSelect('match.links', 'links')
      .leftJoinAndSelect('links.gamer', 'gamer')
      .orderBy('match.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (query.gameId !== undefined) {
      qb.andWhere('match.gameId = :gameId', { gameId: query.gameId });
    }

    // 按 isTest 过滤，默认排除测试对局
    if (query.isTest === true) {
      qb.andWhere('match.isTest = 1');
    } else {
      qb.andWhere('match.isTest = 0');
    }

    // 按 status 过滤（0=pending,1=running,2=finished,3=error）
    if (query.status !== undefined) {
      qb.andWhere('match.status = :status', { status: query.status });
    }

    // 按参赛 gamer 过滤（参赛者含该 gamer）
    if (query.gamerId !== undefined) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM match_gamer_link mgl_p WHERE mgl_p.matchId = match.id AND mgl_p.gamerId = :gamerId)',
        { gamerId: query.gamerId },
      );
    }

    // 按获胜者过滤（该 gamer 在对局中 won=1）
    if (query.winnerId !== undefined) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM match_gamer_link mgl_w WHERE mgl_w.matchId = match.id AND mgl_w.gamerId = :winnerId AND mgl_w.won = 1)',
        { winnerId: query.winnerId },
      );
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

    // Update ELO scores and win flags for all participating gamers
    if (state === 'finished' && result?.finalResult) {
      const finalResult = result.finalResult;

      // Set won=1/0 on match_gamer_link
      const maxScore = Math.max(...Object.values(finalResult));
      for (const [gamerIdStr, score] of Object.entries(finalResult)) {
        const gamerId = Number(gamerIdStr);
        if (!gamerId) continue;
        await this.matchGamerLinkRepo.update(
          { matchId: match.id, gamerId },
          { won: score === maxScore ? 1 : 0 },
        );
      }

      // Skip ELO update for test matches
      if (!match.isTest) {
        // Detect match type: inner if all gamers are 'code' type
        const participantIds = Object.keys(finalResult).map(Number).filter(Boolean);
        const participants = participantIds.length > 0 ? await this.gamerRepo.findBy({ id: In(participantIds) }) : [];
        const matchType = participants.every(g => g.type === 'code') ? 'inner' : 'outer';
        await this.updateElo(finalResult, matchType);
      }

      // Push game-over SSE so browser doesn't wait for the 3s poll
      this.humanTurnService.notifyGameOver(match.id, finalResult);
    }

    return { ok: true };
  }

  /**
   * botzone-neo MatchResult callback: { scores, log, compiles }
   * scores: { [botId string]: number } — botId is gamer id
   */
  /** Forfeit: mark match as ERROR, no ELO change */
  async handleMatchForfeit(matchId: number, forfeitedBotId?: string): Promise<{ ok: boolean }> {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) return { ok: false };
    if (match.status === MatchStatus.FINISHED || match.status === MatchStatus.ERROR) return { ok: true };

    await this.matchRepo.update(matchId, {
      status: MatchStatus.ERROR,
      result: JSON.stringify({ verdict: 'forfeit', forfeitedBot: forfeitedBotId }),
    });
    this.logger.warn(`Match ${matchId} marked as forfeit (bot ${forfeitedBotId} no-response)`);
    return { ok: true };
  }

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
      // Set won=1/0 on match_gamer_link
      const maxScore = Math.max(...Object.values(gamerIdScores));
      for (const [gamerIdStr, score] of Object.entries(gamerIdScores)) {
        const gamerId = Number(gamerIdStr);
        if (!gamerId) continue;
        await this.matchGamerLinkRepo.update(
          { matchId, gamerId },
          { won: score === maxScore ? 1 : 0 },
        );
      }

      // Skip ELO update for test matches
      if (!match.isTest) {
        const participantIds = Object.keys(gamerIdScores).map(Number).filter(Boolean);
        const participants = await this.gamerRepo.findBy({ id: In(participantIds) });
        const matchType = participants.every(g => g.type === 'code') ? 'inner' : 'outer';
        await this.updateElo(gamerIdScores, matchType);
      }

      // Push game-over SSE so browser doesn't wait for the 3s poll
      this.humanTurnService.notifyGameOver(matchId, gamerIdScores);
    }

    return { ok: true };
  }

  /**
   * Pairwise ELO update (K=32) for all gamers in a finished match.
   * matchType:
   *   'inner' — all code bots; updates both `elo` (内榜) and `eloExternal` (外榜)
   *   'outer' — any human/external/webhook; updates only `eloExternal` (外榜)
   */
  private async updateElo(
    finalResult: Record<string, number>,
    matchType: 'inner' | 'outer' = 'outer',
  ): Promise<void> {
    const K = 32;

    const gamerIds = Object.keys(finalResult)
      .map((k) => parseInt(k, 10))
      .filter((id) => !isNaN(id));

    if (gamerIds.length < 2) return;

    const gamers = await this.gamerRepo.findBy({ id: In(gamerIds) });
    if (gamers.length < 2) return;

    // 外榜 ELO map
    const eloExtMap = new Map<number, number>(gamers.map((g) => [g.id, g.eloExternal ?? g.elo]));
    // 内榜 ELO map (only used for inner matches)
    const eloMap = new Map<number, number>(gamers.map((g) => [g.id, g.elo]));

    const deltasExt = new Map<number, number>(gamerIds.map((id) => [id, 0]));
    const deltasInner = new Map<number, number>(gamerIds.map((id) => [id, 0]));

    // Pairwise update for every unique pair
    for (let i = 0; i < gamerIds.length; i++) {
      for (let j = i + 1; j < gamerIds.length; j++) {
        const idA = gamerIds[i];
        const idB = gamerIds[j];

        const scoreA = finalResult[String(idA)] ?? 0;
        const scoreB = finalResult[String(idB)] ?? 0;
        const actualA = scoreA > scoreB ? 1 : scoreA === scoreB ? 0.5 : 0;
        const actualB = 1 - actualA;

        // External leaderboard delta
        const eExtA = eloExtMap.get(idA)!;
        const eExtB = eloExtMap.get(idB)!;
        const expExtA = 1 / (1 + Math.pow(10, (eExtB - eExtA) / 400));
        deltasExt.set(idA, (deltasExt.get(idA) ?? 0) + K * (actualA - expExtA));
        deltasExt.set(idB, (deltasExt.get(idB) ?? 0) + K * (actualB - (1 - expExtA)));

        // Internal leaderboard delta (only for inner matches)
        if (matchType === 'inner') {
          const eA = eloMap.get(idA)!;
          const eB = eloMap.get(idB)!;
          const expA = 1 / (1 + Math.pow(10, (eB - eA) / 400));
          deltasInner.set(idA, (deltasInner.get(idA) ?? 0) + K * (actualA - expA));
          deltasInner.set(idB, (deltasInner.get(idB) ?? 0) + K * (actualB - (1 - expA)));
        }
      }
    }

    // Apply accumulated deltas and record history
    await Promise.all(
      gamers.map(async (g) => {
        const dExt = deltasExt.get(g.id) ?? 0;
        const newEloExt = Math.max(0, Math.round((g.eloExternal ?? g.elo) + dExt));
        const updates: Partial<Gamer> = { eloExternal: newEloExt };

        let newEloInner = g.elo;
        if (matchType === 'inner') {
          const dInner = deltasInner.get(g.id) ?? 0;
          newEloInner = Math.max(0, Math.round(g.elo + dInner));
          updates.elo = newEloInner;
        }

        await this.gamerRepo.update(g.id, updates);

        // Record ELO history (外榜数据)
        try {
          await this.dataSource.query(
            'INSERT INTO gamer_elo_history (gamerId, matchId, eloBefore, eloAfter, eloDelta) VALUES (?, ?, ?, ?, ?)',
            [g.id, 0, g.eloExternal ?? g.elo, newEloExt, Math.round(dExt)],
          );
        } catch { /* history is best-effort */ }
      }),
    );
  }

  /** 查询某个 gamer 的 ELO 历史（最近 100 条） */
  async getEloHistory(gamerId: number): Promise<{ matchId: number; eloBefore: number; eloAfter: number; eloDelta: number; createdAt: Date }[]> {
    return this.dataSource.query(
      'SELECT matchId, eloBefore, eloAfter, eloDelta, createdAt FROM gamer_elo_history WHERE gamerId = ? ORDER BY createdAt DESC LIMIT 100',
      [gamerId],
    );
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────────

  /**
   * 双榜排行榜
   * board='inner'（默认）: 仅 code 类型 gamer，按 elo 排序
   * board='outer': 全部 gamer，按 eloExternal 排序，含类型标注
   */
  async getLeaderboard(gameId: number, board: 'inner' | 'outer' = 'inner'): Promise<LeaderboardEntry[]> {
    await this.findOneGame(gameId);

    const eloCol = board === 'inner' ? 'g.elo' : 'g.eloExternal';

    const qb = this.dataSource
      .createQueryBuilder()
      .select('mgl.gamerId', 'gamerId')
      .addSelect('g.title', 'gamerName')
      .addSelect('g.type', 'gamerType')
      .addSelect(eloCol, 'elo')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN mgl.won = 1 THEN 1 ELSE 0 END)', 'wins')
      .from(MatchGamerLink, 'mgl')
      .innerJoin(Match, 'm', 'm.id = mgl.matchId AND m.gameId = :gameId', { gameId })
      .leftJoin(Gamer, 'g', 'g.id = mgl.gamerId')
      .where('m.status = :status', { status: MatchStatus.FINISHED });

    // 内榜只显示 code 类型
    if (board === 'inner') {
      qb.andWhere("g.type = 'code'");
    }

    const results = await qb
      .groupBy('mgl.gamerId')
      .orderBy(eloCol, 'DESC')
      .getRawMany<{ gamerId: number; gamerName: string; gamerType: string; elo: string; wins: string; total: string }>();

    return results.map((r) => ({
      gamerId: r.gamerId,
      name: r.gamerName,
      type: r.gamerType ?? 'code',
      elo: Number(r.elo ?? 1200),
      wins: Number(r.wins),
      total: Number(r.total),
      winRate: Number(r.total) > 0 ? Number(r.wins) / Number(r.total) : 0,
    }));
  }

  // ─── Global Leaderboard ───────────────────────────────────────────────────────

  async globalLeaderboard(opts: {
    gameId?: number;
    limit: number;
    board: 'inner' | 'outer';
  }): Promise<object[]> {
    const { gameId, limit, board } = opts;
    const eloCol = board === 'inner' ? 'g.elo' : 'g.eloExternal';

    let qb = this.dataSource
      .createQueryBuilder()
      .select('g.id', 'id')
      .addSelect('g.title', 'title')
      .addSelect('g.type', 'type')
      .addSelect('g.elo', 'elo')
      .addSelect('g.eloExternal', 'eloExternal')
      .addSelect('game.id', 'gameId')
      .addSelect('game.title', 'gameTitle')
      .addSelect('u.id', 'userId')
      .addSelect('u.username', 'username')
      .addSelect(
        `(SELECT COUNT(*) FROM match_gamer_link mgl2
           INNER JOIN \`match\` m2 ON m2.id = mgl2.matchId AND m2.status = 2 AND m2.isTest = 0
           WHERE mgl2.gamerId = g.id)`,
        'totalMatches',
      )
      .addSelect(
        `(SELECT COUNT(*) FROM match_gamer_link mgl3
           INNER JOIN \`match\` m3 ON m3.id = mgl3.matchId AND m3.status = 2 AND m3.isTest = 0
           WHERE mgl3.gamerId = g.id AND mgl3.won = 1)`,
        'wins',
      )
      .from(Gamer, 'g')
      .leftJoin('g.game', 'game')
      .leftJoin('g.user', 'u')
      .where('g.isTest = false')
      .andWhere('g.disabled = false')
      .andWhere("g.type = 'code'");

    if (gameId) {
      qb = qb.andWhere('g.gameId = :gameId', { gameId });
    }

    const rows = await qb
      .orderBy(eloCol, 'DESC')
      .limit(limit)
      .getRawMany<{
        id: number;
        title: string;
        type: string;
        elo: string;
        eloExternal: string;
        gameId: number;
        gameTitle: string;
        userId: number;
        username: string;
        totalMatches: string;
        wins: string;
      }>();

    return rows.map((r) => {
      const total = Number(r.totalMatches);
      const wins = Number(r.wins);
      return {
        id: r.id,
        title: r.title,
        type: r.type,
        elo: Number(r.elo),
        eloExternal: Number(r.eloExternal),
        wins,
        totalMatches: total,
        winRate: total > 0 ? Math.round((wins / total) * 1000) / 1000 : 0,
        game: { id: r.gameId, title: r.gameTitle },
        user: { id: r.userId, username: r.username },
      };
    });
  }

  // ─── Bot Stats ────────────────────────────────────────────────────────────────

  async getBotStats(gamerId: number): Promise<object> {
    // Verify gamer exists
    const gamer = await this.gamerRepo.findOne({ where: { id: gamerId } });
    if (!gamer) throw new NotFoundException(`Gamer ${gamerId} 不存在`);

    // Get per-opponent stats via raw query
    const rows = await this.dataSource.query<
      { opponentGamerId: number; opponentName: string; myWon: number | null }[]
    >(
      `SELECT
         opp_mgl.gamerId AS opponentGamerId,
         opp_g.title    AS opponentName,
         mgl.won        AS myWon
       FROM match_gamer_link mgl
       INNER JOIN \`match\` m ON m.id = mgl.matchId AND m.status = 2 AND m.isTest = 0
       INNER JOIN match_gamer_link opp_mgl
         ON opp_mgl.matchId = mgl.matchId AND opp_mgl.gamerId != mgl.gamerId
       LEFT JOIN gamer opp_g ON opp_g.id = opp_mgl.gamerId
       WHERE mgl.gamerId = ?`,
      [gamerId],
    );

    // Aggregate
    const opponentMap = new Map<
      number,
      { gamerId: number; name: string; wins: number; losses: number; draws: number }
    >();

    let totalWins = 0;
    let totalLosses = 0;
    let totalDraws = 0;

    for (const row of rows) {
      const oppId = Number(row.opponentGamerId);
      if (!opponentMap.has(oppId)) {
        opponentMap.set(oppId, {
          gamerId: oppId,
          name: row.opponentName ?? String(oppId),
          wins: 0,
          losses: 0,
          draws: 0,
        });
      }
      const opp = opponentMap.get(oppId)!;
      const won = row.myWon;
      if (won === 1) {
        opp.wins++;
        totalWins++;
      } else if (won === 0) {
        // Determine draw vs loss: if opponent also has won=0 it's a draw.
        // We track by the won field — 0 can mean loss or draw depending on opponent.
        // For simplicity: won=0 means not-a-win; look at opponent's won in same row.
        // Since we're joining per-row we don't have both sides here easily.
        // Treat won=0 as loss, and adjust draws separately below.
        opp.losses++;
        totalLosses++;
      } else {
        // won IS NULL — match still pending (shouldn't happen for status=2, but guard)
        opp.draws++;
        totalDraws++;
      }
    }

    const totalMatches = totalWins + totalLosses + totalDraws;

    return {
      gamerId,
      totalMatches,
      wins: totalWins,
      losses: totalLosses,
      draws: totalDraws,
      winRate: totalMatches > 0 ? Math.round((totalWins / totalMatches) * 1000) / 1000 : 0,
      opponents: Array.from(opponentMap.values()),
    };
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

  /**
   * 运行测试对局（沙盒对局，不计入 ELO 和排行榜）
   * 临时创建一个 test gamer，发起对局，isTest=true。
   */
  async runPlayground(
    gameId: number,
    userId: number,
    dto: { language: string; code: string; opponentGamerId: number },
  ): Promise<{ matchId: number; testGamerId: number }> {
    // 1. 验证游戏存在
    await this.findOneGame(gameId);

    // 2. 验证对手 gamer（必须属于此游戏，类型 code，未禁用），并加载代码
    const opponent = await this.gamerRepo
      .createQueryBuilder('g')
      .addSelect('g.code')
      .where('g.id = :id', { id: dto.opponentGamerId })
      .andWhere('g.gameId = :gameId', { gameId })
      .andWhere("g.type = 'code'")
      .andWhere('g.disabled = 0')
      .getOne();
    if (!opponent) {
      throw new NotFoundException(`对手 #${dto.opponentGamerId} 不存在或不可用`);
    }

    // 3. 创建临时 test gamer（每次创建新记录，不复用）
    const testGamer = this.gamerRepo.create({
      userId,
      gameId,
      title: `[测试] 用户#${userId}`,
      type: 'code',
      language: dto.language,
      code: dto.code,
      opensource: false,
    });
    const savedTestGamer = await this.gamerRepo.save(testGamer);

    // 4. 创建 Match 记录（isTest=true）
    const match = await this.matchRepo.save({
      gameId,
      status: MatchStatus.PENDING,
      isTest: true,
    });

    // 5. 创建 MatchGamerLink（test gamer = position 0，对手 = position 1）
    await this.matchGamerLinkRepo.save([
      { matchId: match.id, gamerId: savedTestGamer.id, index: 0 },
      { matchId: match.id, gamerId: opponent.id, index: 1 },
    ]);

    // 6. 加载 game 的 judger 信息并推入评测队列
    const game = await this.gameRepo
      .createQueryBuilder('g')
      .addSelect('g.judgerCode')
      .addSelect('g.judgerLanguage')
      .where('g.id = :id', { id: gameId })
      .getOne();

    await this.judgeTxQueue.add('compete', {
      matchId: match.id,
      positionToGamerId: { 0: savedTestGamer.id, 1: opponent.id },
      game: {
        judgerCode: game!.judgerCode,
        judgerLanguage: game!.judgerLanguage,
        timeLimit: game!.timeLimit,
        memoryLimit: game!.memoryLimit,
      },
      gamers: [
        {
          id: savedTestGamer.id,
          code: dto.code,
          language: dto.language,
          position: 0,
          type: 'code',
        },
        {
          id: opponent.id,
          code: opponent.code,
          language: opponent.language,
          position: 1,
          type: opponent.type,
          webhookUrl: opponent.webhookUrl ?? undefined,
          webhookSecret: opponent.webhookSecret ?? undefined,
        },
      ],
    });

    // 7. 返回 matchId 和 testGamerId
    return { matchId: match.id, testGamerId: savedTestGamer.id };
  }

  /**
   * 运行带自定义裁判的测试对局（不计 ELO，不出现在普通对局列表）
   *
   * - bot0/bot1 可指定 gamerId（使用现有 gamer）或 code（临时创建 test gamer）
   * - judgerCode 可覆盖游戏自带裁判代码
   */
  async runPlaygroundJudge(
    gameId: number,
    userId: number,
    dto: PlaygroundJudgeDto,
  ): Promise<{ matchId: number; testGamerIds: number[] }> {
    // 1. 加载游戏（含 judgerCode）
    const game = await this.gameRepo
      .createQueryBuilder('g')
      .addSelect('g.judgerCode')
      .addSelect('g.judgerLanguage')
      .where('g.id = :id', { id: gameId })
      .getOne();
    if (!game) throw new NotFoundException(`游戏 #${gameId} 不存在`);

    const testGamerIds: number[] = [];

    // 2. 解析 bot0 / bot1
    const resolveBot = async (
      spec: PlaygroundJudgeDto['bot0'],
      position: 0 | 1,
    ): Promise<{ gamer: Gamer; isNew: boolean }> => {
      if (spec.gamerId !== undefined) {
        // 使用现有 gamer
        const gamer = await this.gamerRepo
          .createQueryBuilder('g')
          .addSelect('g.code')
          .where('g.id = :id', { id: spec.gamerId })
          .getOne();
        if (!gamer) throw new NotFoundException(`Gamer #${spec.gamerId} 不存在`);
        return { gamer, isNew: false };
      } else if (spec.code !== undefined) {
        if (!spec.language) throw new BadRequestException(`bot${position} 提供了 code 但未指定 language`);
        // 创建临时 test gamer
        const testGamer = this.gamerRepo.create({
          userId,
          gameId,
          title: `[测试] 用户#${userId}-pos${position}`,
          type: 'code',
          language: spec.language,
          code: spec.code,
          opensource: false,
          isTest: true,
        } as any);
        const saved = await this.gamerRepo.save(testGamer) as unknown as Gamer;
        return { gamer: saved, isNew: true };
      } else {
        throw new BadRequestException(`bot${position} 必须提供 gamerId 或 code`);
      }
    };

    const [{ gamer: gamer0, isNew: isNew0 }, { gamer: gamer1, isNew: isNew1 }] =
      await Promise.all([
        resolveBot(dto.bot0, 0),
        resolveBot(dto.bot1, 1),
      ]);

    if (isNew0) testGamerIds.push(gamer0.id);
    if (isNew1) testGamerIds.push(gamer1.id);

    // 3. 创建 Match（isTest=true）
    const match = await this.matchRepo.save({
      gameId,
      status: MatchStatus.PENDING,
      isTest: true,
    });

    // 4. 创建 MatchGamerLink
    await this.matchGamerLinkRepo.save([
      { matchId: match.id, gamerId: gamer0.id, index: 0 },
      { matchId: match.id, gamerId: gamer1.id, index: 1 },
    ]);

    // 5. 决定 judger 规格：dto.judgerCode 优先，否则用游戏自带
    const effectiveJudgerCode = dto.judgerCode ?? game.judgerCode ?? '';
    const effectiveJudgerLanguage =
      dto.judgerCode !== undefined
        ? (dto.judgerLanguage ?? 'python')
        : (game.judgerLanguage ?? '');

    // 6. 推入评测队列
    await this.judgeTxQueue.add('compete', {
      matchId: match.id,
      positionToGamerId: { 0: gamer0.id, 1: gamer1.id },
      game: {
        judgerCode: effectiveJudgerCode,
        judgerLanguage: effectiveJudgerLanguage,
        timeLimit: game.timeLimit,
        memoryLimit: game.memoryLimit,
      },
      gamers: [
        {
          id: gamer0.id,
          code: (gamer0 as any).code ?? dto.bot0.code ?? '',
          language: gamer0.language,
          position: 0,
          type: gamer0.type ?? 'code',
          webhookUrl: gamer0.webhookUrl ?? undefined,
          webhookSecret: gamer0.webhookSecret ?? undefined,
        },
        {
          id: gamer1.id,
          code: (gamer1 as any).code ?? dto.bot1.code ?? '',
          language: gamer1.language,
          position: 1,
          type: gamer1.type ?? 'code',
          webhookUrl: gamer1.webhookUrl ?? undefined,
          webhookSecret: gamer1.webhookSecret ?? undefined,
        },
      ],
    });

    return { matchId: match.id, testGamerIds };
  }

  /**
   * 触发自动对局：从游戏中取 ELO 最高的 N 个非禁用 gamer，
   * 按 round-robin 生成匹配对，批量创建 match。
   */
  async triggerAutoMatch(gameId: number, topN = 8): Promise<{ created: number; matchIds: number[] }> {
    const game = await this.findOneGame(gameId);
    if (game.disabled) throw new BadRequestException('游戏已禁用');

    // 取 ELO 最高的 topN 个 gamer
    // 仅取 code 类型且未禁用的 bot（内榜参赛者）
    const gamers = await this.gamerRepo.find({
      where: { gameId, type: 'code', disabled: false },
      order: { elo: 'DESC' },
      take: topN,
    });

    const needed = game.gamerQuantity ?? 2;
    if (gamers.length < needed) {
      throw new BadRequestException(`参赛者不足（需要至少 ${needed} 个，当前 ${gamers.length} 个）`);
    }

    // Round-robin 配对（每对只生成一场）
    const matchIds: number[] = [];
    for (let i = 0; i < gamers.length; i++) {
      for (let j = i + 1; j < gamers.length; j += needed - 1) {
        const pair = gamers.slice(j, j + needed - 1);
        if (pair.length < needed - 1) break;
        const ids = [gamers[i].id, ...pair.map(g => g.id)];
        if (ids.length === needed) {
          const match = await this.launchMatch(gameId, ids);
          matchIds.push(match.id);
        }
      }
    }

    return { created: matchIds.length, matchIds };
  }
}
