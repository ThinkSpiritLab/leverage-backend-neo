/**
 * problem.integration.spec.ts
 *
 * Integration tests for ProblemService using:
 * - SQLite in-memory (via better-sqlite3 + TypeORM)
 * - ioredis-mock for CacheService
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ProblemService } from '../../src/modules/problem/problem.service';
import { Problem } from '../../src/database/entities/problem.entity';
import { Tag } from '../../src/database/entities/tag.entity';
import { CacheService } from '../../src/modules/redis/cache.service';
import { RedisService } from '../../src/modules/redis/redis.service';
import { ALL_ENTITIES, patchBoolColumnsForSqlite } from './setup';
import { createMockRedisService } from './redis.mock';

// Patch 'bool' → 'integer' for SQLite compatibility
patchBoolColumnsForSqlite();

// Integration tests may take longer due to DB setup
jest.setTimeout(30000);
import { ProblemQueryDto } from '../../src/modules/problem/dto/problem-query.dto';

describe('ProblemService (integration)', () => {
  let module: TestingModule;
  let problemService: ProblemService;
  let dataSource: DataSource;
  let problemRepo: any;
  let tagRepo: any;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: ALL_ENTITIES,
          synchronize: true,
          logging: false,
        } as any),
        TypeOrmModule.forFeature([Problem, Tag]),
      ],
      providers: [
        ProblemService,
        CacheService,
        {
          provide: RedisService,
          useValue: createMockRedisService(),
        },
      ],
    }).compile();

    problemService = module.get<ProblemService>(ProblemService);
    dataSource = module.get<DataSource>(DataSource);
    problemRepo = dataSource.getRepository(Problem);
    tagRepo = dataSource.getRepository(Tag);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    // Clean in correct order to avoid FK violations
    // Use query to clear join/closure tables, then clear main tables
    await problemRepo.query('DELETE FROM problem_tags_tag');
    await problemRepo.clear();
    await tagRepo.query('DELETE FROM tag_closure');
    await tagRepo.clear();
  });

  describe('create and retrieve a problem', () => {
    it('should create a problem and retrieve it by id', async () => {
      // Arrange + Act
      const created = await problemService.create({
        title: 'Hello World',
        content: 'Print Hello World',
        source: 'Leverage',
        timeLimit: 1000,
        memoryLimit: 64,
        prefix: 'p',
        logicId: 1001,
        closed: false,
        restricted: false,
      });

      // Assert
      expect(created.id).toBeDefined();
      expect(created.title).toBe('Hello World');
      expect(created.prefix).toBe('p');
      expect(created.logicId).toBe(1001);

      // Retrieve by id
      const found = await problemService.findOne(created.id, true);
      expect(found.title).toBe('Hello World');
      expect(found.content).toBe('Print Hello World');
      expect(found.timeLimit).toBe(1000);
      expect(found.memoryLimit).toBe(64);
    });

    it('should throw NotFoundException for non-existent problem', async () => {
      await expect(problemService.findOne(99999, true)).rejects.toThrow(
        '不存在',
      );
    });

    it('should auto-assign logicId starting from 1000 when not provided', async () => {
      const problem = await problemService.create({
        title: 'Auto ID Problem',
        content: 'Content',
        source: 'Test',
        timeLimit: 500,
        memoryLimit: 32,
        prefix: 'auto',
      });

      expect(problem.logicId).toBe(1000);

      // Second problem with same prefix should get 1001
      const problem2 = await problemService.create({
        title: 'Auto ID Problem 2',
        content: 'Content',
        source: 'Test',
        timeLimit: 500,
        memoryLimit: 32,
        prefix: 'auto',
      });

      expect(problem2.logicId).toBe(1001);
    });
  });

  describe('filter problems by tag', () => {
    it('should return only problems matching the given tagId', async () => {
      // Create two tags
      const tag1 = tagRepo.create({ name: 'Dynamic Programming' });
      const savedTag1 = await tagRepo.save(tag1);

      const tag2 = tagRepo.create({ name: 'Graph Theory' });
      const savedTag2 = await tagRepo.save(tag2);

      // Create problems with different tags
      const prob1 = await problemService.create({
        title: 'DP Problem',
        content: 'Solve with DP',
        source: 'Test',
        timeLimit: 1000,
        memoryLimit: 64,
        prefix: 'tag',
        logicId: 2001,
        tagIds: [savedTag1.id],
        closed: false,
      });

      await problemService.create({
        title: 'Graph Problem',
        content: 'Solve with Graph',
        source: 'Test',
        timeLimit: 1000,
        memoryLimit: 64,
        prefix: 'tag',
        logicId: 2002,
        tagIds: [savedTag2.id],
        closed: false,
      });

      // Query by tag1
      const query: ProblemQueryDto = {
        tagIds: [savedTag1.id],
        page: 1,
        perPage: 20,
      };
      const { items, total } = await problemService.findAll(query, true);

      expect(total).toBe(1);
      expect(items[0].title).toBe('DP Problem');
    });
  });

  describe('pagination', () => {
    it('should paginate correctly — page 1 of 5 from 10 problems', async () => {
      // Create 10 problems
      for (let i = 1; i <= 10; i++) {
        await problemService.create({
          title: `Paginate Problem ${i}`,
          content: `Content ${i}`,
          source: 'Test',
          timeLimit: 1000,
          memoryLimit: 64,
          prefix: 'pg',
          logicId: 3000 + i,
          closed: false,
        });
      }

      const query: ProblemQueryDto = { page: 1, perPage: 5 };
      const { items, total } = await problemService.findAll(query, true);

      expect(total).toBe(10);
      expect(items).toHaveLength(5);
    });

    it('should paginate correctly — page 2 of 5 from 10 problems', async () => {
      for (let i = 1; i <= 10; i++) {
        await problemService.create({
          title: `Page2 Problem ${i}`,
          content: `Content ${i}`,
          source: 'Test',
          timeLimit: 1000,
          memoryLimit: 64,
          prefix: 'p2',
          logicId: 4000 + i,
          closed: false,
        });
      }

      const page1 = await problemService.findAll({ page: 1, perPage: 5 }, true);
      const page2 = await problemService.findAll({ page: 2, perPage: 5 }, true);

      expect(page1.total).toBe(10);
      expect(page1.items).toHaveLength(5);
      expect(page2.items).toHaveLength(5);

      // Pages should have different problems
      const page1Ids = page1.items.map((p: Problem) => p.id);
      const page2Ids = page2.items.map((p: Problem) => p.id);
      expect(page1Ids).not.toEqual(page2Ids);
    });
  });

  describe('visibility filtering', () => {
    it('should hide closed problems from non-admin users', async () => {
      await problemService.create({
        title: 'Open Problem',
        content: 'Available',
        source: 'Test',
        timeLimit: 1000,
        memoryLimit: 64,
        prefix: 'vis',
        logicId: 5001,
        closed: false,
        restricted: false,
      });

      await problemService.create({
        title: 'Closed Problem',
        content: 'Hidden',
        source: 'Test',
        timeLimit: 1000,
        memoryLimit: 64,
        prefix: 'vis',
        logicId: 5002,
        closed: true,
      });

      const userResult = await problemService.findAll(
        { page: 1, perPage: 20 },
        false,
      );
      const adminResult = await problemService.findAll(
        { page: 1, perPage: 20 },
        true,
      );

      // Non-admin should only see the open problem
      expect(userResult.items.every((p: Problem) => !p.closed)).toBe(true);
      // Admin sees all
      expect(adminResult.total).toBeGreaterThanOrEqual(2);
    });
  });

  describe('update problem', () => {
    it('should update problem title and content', async () => {
      const problem = await problemService.create({
        title: 'Original Title',
        content: 'Original Content',
        source: 'Test',
        timeLimit: 1000,
        memoryLimit: 64,
        prefix: 'upd',
        logicId: 6001,
      });

      const updated = await problemService.update(problem.id, {
        title: 'Updated Title',
        content: 'Updated Content',
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.content).toBe('Updated Content');
    });
  });
});
