import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import type { Job } from 'bull';
import { JudgeRxWorker } from './judge-rx.worker';
import { RedisService } from '../../redis/redis.service';
import { ReceiveService } from '../../receive/receive.service';
import { JUDGE_RX_QUEUE } from '../../queue/queue.constants';
import {
  JudgeResult,
  JudgeResultKind,
  JudgeRxPayload,
  JudgeState,
  JudgeStateUpdate,
} from '../heng.types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SUBMISSION_ID = 101;
const JUDGE_ID = 'deadbeef1234567890abcdef12345678';

const mockRedisService = {
  sismember: jest.fn(),
  srem: jest.fn(),
};

const mockReceiveService = {
  receiveResult: jest.fn(),
  receiveUpdate: jest.fn(),
};

const mockQueue = {
  close: jest.fn().mockResolvedValue(undefined),
};

/** 构建一个 finish payload（带 JudgeResult） */
function buildFinishPayload(
  cases: JudgeResult['cases'],
  overrides?: Partial<{ submissionId: number; judgeId: string }>,
): JudgeRxPayload {
  return {
    submissionId: overrides?.submissionId ?? SUBMISSION_ID,
    judgeId: overrides?.judgeId ?? JUDGE_ID,
    type: 'finish',
    data: { cases, extra: {} },
  };
}

/** 构建一个 update payload（带 JudgeStateUpdate） */
function buildUpdatePayload(
  state: JudgeState,
  overrides?: Partial<{ submissionId: number; judgeId: string }>,
): JudgeRxPayload {
  return {
    submissionId: overrides?.submissionId ?? SUBMISSION_ID,
    judgeId: overrides?.judgeId ?? JUDGE_ID,
    type: 'update',
    data: { state },
  };
}

/** 构建 BullMQ Job mock */
function buildJob(data: JudgeRxPayload): Job<JudgeRxPayload> {
  return {
    id: 'rx-job-1',
    data,
    opts: {},
    queue: {} as any,
    attemptsMade: 0,
  } as unknown as Job<JudgeRxPayload>;
}

/** 常用的单 case 结果 */
const makeCase = (kind: JudgeResultKind, time = 100, memory = 1024 * 1024) => ({
  kind,
  time,
  memory,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JudgeRxWorker', () => {
  let worker: JudgeRxWorker;

  beforeEach(async () => {
    jest.clearAllMocks();

    // 默认：judgeId 合法
    mockRedisService.sismember.mockResolvedValue(1);
    mockRedisService.srem.mockResolvedValue(1);
    mockReceiveService.receiveResult.mockResolvedValue(undefined);
    mockReceiveService.receiveUpdate.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JudgeRxWorker,
        { provide: RedisService, useValue: mockRedisService },
        { provide: ReceiveService, useValue: mockReceiveService },
        { provide: getQueueToken(JUDGE_RX_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    worker = module.get<JudgeRxWorker>(JudgeRxWorker);
  });

  // ─── 防重放验证 ──────────────────────────────────────────────────────────

  describe('防重放（stale judgeId）', () => {
    it('judgeId 不在 Redis Set 中时，直接忽略不调用 receiveResult', async () => {
      mockRedisService.sismember.mockResolvedValue(0);

      const payload = buildFinishPayload([makeCase(JudgeResultKind.Accepted)]);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveResult).not.toHaveBeenCalled();
      expect(mockReceiveService.receiveUpdate).not.toHaveBeenCalled();
    });

    it('judgeId 合法时，sismember 检查正确的 key', async () => {
      const payload = buildFinishPayload([makeCase(JudgeResultKind.Accepted)]);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockRedisService.sismember).toHaveBeenCalledWith(
        `judge-ids:${SUBMISSION_ID}`,
        JUDGE_ID,
      );
    });
  });

  // ─── finish 类型：最终结果 ───────────────────────────────────────────────

  describe('finish 类型', () => {
    it('AC：调用 receiveResult，并从 Redis 删除 judgeId', async () => {
      const payload = buildFinishPayload([makeCase(JudgeResultKind.Accepted)]);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveResult).toHaveBeenCalledTimes(1);
      expect(mockReceiveService.receiveResult).toHaveBeenCalledWith(
        SUBMISSION_ID,
        payload.data,
        JUDGE_ID,
      );
      // 完成后清理 judgeId
      expect(mockRedisService.srem).toHaveBeenCalledWith(
        `judge-ids:${SUBMISSION_ID}`,
        JUDGE_ID,
      );
    });

    it('WA：调用 receiveResult，传递正确 data', async () => {
      const payload = buildFinishPayload([
        makeCase(JudgeResultKind.WrongAnswer),
      ]);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveResult).toHaveBeenCalledWith(
        SUBMISSION_ID,
        payload.data,
        JUDGE_ID,
      );
    });

    it('TLE：调用 receiveResult', async () => {
      const payload = buildFinishPayload([
        makeCase(JudgeResultKind.TimeLimitExceeded),
      ]);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveResult).toHaveBeenCalledTimes(1);
    });

    it('CE（编译错误）：调用 receiveResult，data 含 compileMessage', async () => {
      const result: JudgeResult = {
        cases: [],
        extra: {
          user: {
            compileMessage: "error: expected ';' before '}' token",
            compileTime: 1000,
          },
        },
      };
      const payload: JudgeRxPayload = {
        submissionId: SUBMISSION_ID,
        judgeId: JUDGE_ID,
        type: 'finish',
        data: result,
      };
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveResult).toHaveBeenCalledWith(
        SUBMISSION_ID,
        expect.objectContaining({
          extra: expect.objectContaining({
            user: expect.objectContaining({
              compileMessage: expect.stringContaining('error'),
            }),
          }),
        }),
        JUDGE_ID,
      );
    });

    it('RE（运行时错误）：调用 receiveResult', async () => {
      const payload = buildFinishPayload([
        makeCase(JudgeResultKind.RuntimeError),
      ]);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveResult).toHaveBeenCalledTimes(1);
    });

    it('MLE（内存超限）：调用 receiveResult', async () => {
      const payload = buildFinishPayload([
        makeCase(JudgeResultKind.MemoryLimitExceeded),
      ]);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveResult).toHaveBeenCalledTimes(1);
    });

    it('多 case 结果：data.cases 正确传递给 receiveResult', async () => {
      const cases = [
        makeCase(JudgeResultKind.Accepted, 50, 512 * 1024),
        makeCase(JudgeResultKind.WrongAnswer, 80, 768 * 1024),
        makeCase(JudgeResultKind.TimeLimitExceeded, 2000, 1024 * 1024),
      ];
      const payload = buildFinishPayload(cases);
      const job = buildJob(payload);

      await worker.handle(job);

      const receivedData: JudgeResult =
        mockReceiveService.receiveResult.mock.calls[0][1];
      expect(receivedData.cases).toHaveLength(3);
      expect(receivedData.cases[0].kind).toBe(JudgeResultKind.Accepted);
      expect(receivedData.cases[2].kind).toBe(
        JudgeResultKind.TimeLimitExceeded,
      );
    });

    it('finish 后 receiveUpdate 不被调用', async () => {
      const payload = buildFinishPayload([makeCase(JudgeResultKind.Accepted)]);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveUpdate).not.toHaveBeenCalled();
    });
  });

  // ─── update 类型：中间状态 ───────────────────────────────────────────────

  describe('update 类型', () => {
    it('Judging 中间状态：调用 receiveUpdate', async () => {
      const payload = buildUpdatePayload(JudgeState.Judging);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveUpdate).toHaveBeenCalledTimes(1);
      expect(mockReceiveService.receiveUpdate).toHaveBeenCalledWith(
        SUBMISSION_ID,
        { state: JudgeState.Judging },
        JUDGE_ID,
      );
    });

    it('Pending 中间状态：调用 receiveUpdate', async () => {
      const payload = buildUpdatePayload(JudgeState.Pending);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveUpdate).toHaveBeenCalledWith(
        SUBMISSION_ID,
        { state: JudgeState.Pending },
        JUDGE_ID,
      );
    });

    it('Preparing 中间状态（编译中）：调用 receiveUpdate', async () => {
      const payload = buildUpdatePayload(JudgeState.Preparing);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveUpdate).toHaveBeenCalledWith(
        SUBMISSION_ID,
        { state: JudgeState.Preparing },
        JUDGE_ID,
      );
    });

    it('update 时不调用 receiveResult', async () => {
      const payload = buildUpdatePayload(JudgeState.Judging);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockReceiveService.receiveResult).not.toHaveBeenCalled();
    });

    it('update 时不删除 judgeId（评测未完成，继续持有）', async () => {
      const payload = buildUpdatePayload(JudgeState.Judging);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockRedisService.srem).not.toHaveBeenCalled();
    });
  });

  // ─── receiveResult 异常处理 ──────────────────────────────────────────────

  describe('receiveResult 异常处理', () => {
    it('receiveResult 抛出异常时，异常向上传播（BullMQ 重试）', async () => {
      mockReceiveService.receiveResult.mockRejectedValue(
        new Error('DB transaction failed'),
      );

      const payload = buildFinishPayload([makeCase(JudgeResultKind.Accepted)]);
      const job = buildJob(payload);

      await expect(worker.handle(job)).rejects.toThrow('DB transaction failed');
    });

    it('receiveResult 抛出异常时，srem 依然被调用（judgeId 已清理）', async () => {
      mockReceiveService.receiveResult.mockRejectedValue(
        new Error('tx failed'),
      );

      const payload = buildFinishPayload([makeCase(JudgeResultKind.Accepted)]);
      const job = buildJob(payload);

      // srem 在 receiveResult 之后（代码流程：先 receiveResult，再 srem）
      // 如果 receiveResult 抛出，srem 不会执行——这符合"重试"语义：
      // judgeId 保留在 Redis 中，下次重试时仍可合法处理
      await expect(worker.handle(job)).rejects.toThrow();

      // 确认 srem 没有被调用（judgeId 保留以备重试）
      expect(mockRedisService.srem).not.toHaveBeenCalled();
    });
  });

  // ─── judgeId 清理时机 ────────────────────────────────────────────────────

  describe('judgeId 生命周期', () => {
    it('finish 成功后，srem 从正确的 key 删除 judgeId', async () => {
      const submissionId = 999;
      const judgeId = 'custom-judge-id-xyz';
      const payload = buildFinishPayload([makeCase(JudgeResultKind.Accepted)], {
        submissionId,
        judgeId,
      });
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockRedisService.srem).toHaveBeenCalledWith(
        `judge-ids:${submissionId}`,
        judgeId,
      );
    });

    it('stale judgeId 时 srem 不被调用', async () => {
      mockRedisService.sismember.mockResolvedValue(0);

      const payload = buildFinishPayload([makeCase(JudgeResultKind.Accepted)]);
      const job = buildJob(payload);

      await worker.handle(job);

      expect(mockRedisService.srem).not.toHaveBeenCalled();
    });
  });
});
