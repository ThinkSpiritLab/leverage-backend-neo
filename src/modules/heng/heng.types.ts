/**
 * Heng 协议类型定义
 * 来源：Heng-Protocol external-protocol + index.ts
 */

// ─── 基础类型 ────────────────────────────────────────────────────────────────

export type HengFile = {
  hashsum?: string; // sha256
} & ({ type: 'url'; url: string } | { type: 'direct'; content: string });

export type HengDynamicFile =
  | { type: 'builtin'; name: string }
  | { type: 'remote'; file: HengFile; name: string };

export enum HengTestPolicy {
  Fuse = 'fuse',
  All = 'all',
}

export interface HengTestCase {
  input: string;
  output: string;
}

export enum HengJudgeType {
  Normal = 'normal',
  Special = 'special',
  Interactive = 'interactive',
}

export interface HengLimit {
  runtime: {
    memory: number; // byte
    cpuTime: number; // ms
    output: number; // byte
  };
  compiler: {
    memory: number; // byte
    cpuTime: number; // ms
    output: number; // byte
    message: number; // byte
  };
}

export interface HengExecutable {
  source: HengFile;
  environment: {
    language: string;
    system: 'Windows' | 'Linux' | 'Darwin';
    arch: 'x64' | 'arm' | 'risc-v' | 'powerpc' | 'mips';
    options: Record<string, string | number | boolean>;
  };
  limit: HengLimit;
}

export type HengJudge =
  | { type: HengJudgeType.Normal; user: HengExecutable }
  | { type: HengJudgeType.Special; user: HengExecutable; spj: HengExecutable }
  | {
      type: HengJudgeType.Interactive;
      user: HengExecutable;
      interactor: HengExecutable;
    };

// ─── 请求体（发给 heng-controller POST /c/v1/judges） ────────────────────────

export interface CreateJudgeRequest {
  data?: HengFile;
  dynamicFiles?: HengDynamicFile[];
  judge: HengJudge;
  test?: {
    cases: HengTestCase[];
    policy: HengTestPolicy;
  };
  callbackUrls: {
    update: string;
    finish: string;
  };
}

// ─── 状态枚举（JudgeState） ───────────────────────────────────────────────────

export enum JudgeState {
  Confirmed = 'confirmed',
  Pending = 'pending',
  Preparing = 'preparing',
  Judging = 'judging',
  Finished = 'finished',
}

// ─── 中间状态回调（POST /heng/update/:submissionId/:judgeId） ─────────────────

export interface JudgeStateUpdate {
  state: JudgeState;
}

// ─── 结果 kind 枚举 ───────────────────────────────────────────────────────────

export enum JudgeResultKind {
  Accepted = 'Accepted',
  WrongAnswer = 'WrongAnswer',
  PresentationError = 'PresentationError',

  TimeLimitExceeded = 'TimeLimitExceeded',
  MemoryLimitExceeded = 'MemoryLimitExceeded',
  OutpuLimitExceeded = 'OutpuLimitExceeded',
  RuntimeError = 'RuntimeError',

  CompileError = 'CompileError',
  CompileTimeLimitExceeded = 'CompileTimeLimitExceeded',
  CompileMemoryLimitExceeded = 'CompileMemoryLimitExceed',
  CompileFileLimitExceeded = 'CompileFileLimitExceed',

  SystemError = 'SystemError',
  SystemTimeLimitExceeded = 'SystemTimeLimitExceed',
  SystemMemoryLimitExceeded = 'SystemMemoryLimitExceed',
  SystemOutpuLimitExceeded = 'SystemOutpuLimitExceeded',
  SystemRuntimeError = 'SystemRuntimeError',
  SystemCompileError = 'SystemCompileError',

  Unjudged = 'Unjudged',
}

// ─── 单 case 结果 ─────────────────────────────────────────────────────────────

export interface JudgeCaseResult {
  kind: JudgeResultKind;
  time: number; // ms
  memory: number; // byte
  extraMessage?: string;
}

// ─── 最终结果回调（POST /heng/finish/:submissionId/:judgeId） ─────────────────

export interface JudgeResult {
  cases: JudgeCaseResult[];
  extra?: {
    user?: { compileMessage?: string; compileTime?: number };
    spj?: { compileMessage?: string; compileTime?: number };
    interactor?: { compileMessage?: string; compileTime?: number };
  };
  /** judger 标识（评测机名称），由 heng-controller 透传 */
  judger?: string;
}

// ─── Submission 状态枚举（与数据库 status 字段对应） ──────────────────────────

export enum Status {
  AC = 0,
  WA = 1,
  TLE = 2,
  MLE = 3,
  CE = 4,
  SE = 5,
  RE = 6,
  PE = 7,
  CRLE = 8,
  PENDING = 9,
  JUDGING = 10,
  COMPILING = 11,
  OLE = 12,
  SC = 13,
}

/** JudgeResultKind → Status 映射 */
export const JudgeResultKindToStatus: Record<JudgeResultKind, Status> = {
  [JudgeResultKind.Accepted]: Status.AC,
  [JudgeResultKind.WrongAnswer]: Status.WA,
  [JudgeResultKind.PresentationError]: Status.PE,
  [JudgeResultKind.TimeLimitExceeded]: Status.TLE,
  [JudgeResultKind.MemoryLimitExceeded]: Status.MLE,
  [JudgeResultKind.OutpuLimitExceeded]: Status.OLE,
  [JudgeResultKind.RuntimeError]: Status.RE,
  [JudgeResultKind.CompileError]: Status.CE,
  [JudgeResultKind.CompileTimeLimitExceeded]: Status.CRLE,
  [JudgeResultKind.CompileMemoryLimitExceeded]: Status.CRLE,
  [JudgeResultKind.CompileFileLimitExceeded]: Status.CRLE,
  [JudgeResultKind.SystemError]: Status.SE,
  [JudgeResultKind.SystemTimeLimitExceeded]: Status.SE,
  [JudgeResultKind.SystemMemoryLimitExceeded]: Status.SE,
  [JudgeResultKind.SystemOutpuLimitExceeded]: Status.SE,
  [JudgeResultKind.SystemRuntimeError]: Status.SE,
  [JudgeResultKind.SystemCompileError]: Status.SE,
  [JudgeResultKind.Unjudged]: Status.SE,
};

/** JudgeState → Status 映射 */
export const JudgeStateToStatus: Record<JudgeState, Status> = {
  [JudgeState.Confirmed]: Status.PENDING,
  [JudgeState.Pending]: Status.PENDING,
  [JudgeState.Preparing]: Status.COMPILING,
  [JudgeState.Judging]: Status.JUDGING,
  [JudgeState.Finished]: Status.JUDGING,
};

// ─── BullMQ Job 类型 ──────────────────────────────────────────────────────────

/** judge-tx 队列 payload */
export interface JudgeTxPayload {
  submissionId: number;
  attemptId?: string;
  /** CreateJudgeRequest 中除 callbackUrls 外的所有字段 */
  task: Omit<CreateJudgeRequest, 'callbackUrls'>;
}

/** judge-rx 队列 payload */
export type JudgeRxPayload = {
  submissionId: number;
  judgeId: string;
} & (
  | { type: 'update'; data: JudgeStateUpdate }
  | { type: 'finish'; data: JudgeResult }
);
