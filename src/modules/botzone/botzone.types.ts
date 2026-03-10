import { Status } from '../heng/heng.types';

/**
 * Botzone-neo API types
 *
 * These types describe the HTTP contract between leverage-backend-neo
 * and the botzone-neo judge service.
 */

// ─── Botzone job status strings ───────────────────────────────────────────────

export enum BotzoneJobStatus {
  Pending = 'Pending',
  Queued = 'Queued',
  Compiling = 'Compiling',
  Running = 'Running',
  Accepted = 'Accepted',
  WrongAnswer = 'WrongAnswer',
  TimeLimitExceeded = 'TimeLimitExceeded',
  MemoryLimitExceeded = 'MemoryLimitExceeded',
  RuntimeError = 'RuntimeError',
  CompileError = 'CompileError',
  SystemError = 'SystemError',
  OutputLimitExceeded = 'OutputLimitExceeded',
  PresentationError = 'PresentationError',
}

// ─── Submit request/response ──────────────────────────────────────────────────

export interface BotzoneSubmitRequest {
  /** Source code (base64 encoded) */
  sourceCode: string;
  /** Language identifier used by botzone-neo */
  language: string;
  /** Botzone-neo problem identifier */
  problemId: string;
  /** Time limit in milliseconds */
  timeLimit: number;
  /** Memory limit in megabytes */
  memoryLimitMB: number;
  /** Callback URL to receive the result */
  callbackUrl: string;
  /** Opaque string echoed back in callback for correlation */
  correlationId: string;
}

export interface BotzoneSubmitResponse {
  jobId: string;
  /** Estimated queue position (informational) */
  queuePosition?: number;
}

// ─── Poll response ────────────────────────────────────────────────────────────

export interface BotzonePollResponse {
  jobId: string;
  status: BotzoneJobStatus;
  /** Total CPU time (ms) across all test cases */
  time?: number;
  /** Peak memory usage (bytes) */
  memory?: number;
  /** Per-case judge results (JSON string) */
  judgeResult?: string;
  compileErrorMsg?: string;
}

// ─── Callback body (POST /botzone/callback) ───────────────────────────────────

export interface BotzoneCallbackBody {
  jobId: string;
  correlationId: string;
  status: BotzoneJobStatus;
  time?: number;
  memory?: number;
  judgeResult?: string;
  compileErrorMsg?: string;
}

// ─── Status mapping ───────────────────────────────────────────────────────────

export const BOTZONE_STATUS_TO_LEVERAGE: Record<BotzoneJobStatus, Status> = {
  [BotzoneJobStatus.Pending]: Status.PENDING,
  [BotzoneJobStatus.Queued]: Status.PENDING,
  [BotzoneJobStatus.Compiling]: Status.COMPILING,
  [BotzoneJobStatus.Running]: Status.JUDGING,
  [BotzoneJobStatus.Accepted]: Status.AC,
  [BotzoneJobStatus.WrongAnswer]: Status.WA,
  [BotzoneJobStatus.TimeLimitExceeded]: Status.TLE,
  [BotzoneJobStatus.MemoryLimitExceeded]: Status.MLE,
  [BotzoneJobStatus.RuntimeError]: Status.RE,
  [BotzoneJobStatus.CompileError]: Status.CE,
  [BotzoneJobStatus.SystemError]: Status.SE,
  [BotzoneJobStatus.OutputLimitExceeded]: Status.OLE,
  [BotzoneJobStatus.PresentationError]: Status.PE,
};

/** Terminal statuses (job is done, no further polling needed) */
export const BOTZONE_TERMINAL_STATUSES = new Set<BotzoneJobStatus>([
  BotzoneJobStatus.Accepted,
  BotzoneJobStatus.WrongAnswer,
  BotzoneJobStatus.TimeLimitExceeded,
  BotzoneJobStatus.MemoryLimitExceeded,
  BotzoneJobStatus.RuntimeError,
  BotzoneJobStatus.CompileError,
  BotzoneJobStatus.SystemError,
  BotzoneJobStatus.OutputLimitExceeded,
  BotzoneJobStatus.PresentationError,
]);

/** Botzone language codes (leverage language int → botzone language string) */
export const LEVERAGE_LANG_TO_BOTZONE: Record<number, string> = {
  0: 'c',
  1: 'cpp11',
  2: 'cpp14',
  3: 'cpp17',
  4: 'pascal',
  5: 'c',
  6: 'java',
  7: 'kotlin',
  8: 'python2',
  9: 'python3',
  10: 'javascript',
  11: 'typescript',
};
