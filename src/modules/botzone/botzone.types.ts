import { Status } from '../heng/heng.types';

/**
 * Botzone-neo API types
 *
 * These types describe the HTTP contract between leverage-backend-neo
 * and the botzone-neo judge service.
 *
 * API shape (GET /v1/judge/:jobId/status):
 *   { jobId, state, type, finishedOn?, failedReason?, result? }
 *
 * result for OJ type:
 *   { verdict, testcases: [{id, verdict, actualOutput, timeMs, memoryKb, message}], compile: {verdict, message?} }
 *
 * result for botzone game type:
 *   { verdict, rounds?: [...], finalResult?: { [botId]: score } }
 */

// ─── Job state (lifecycle phase) ──────────────────────────────────────────────

export type BotzoneJobState =
  | 'pending'
  | 'queued'
  | 'compiling'
  | 'running'
  | 'finished'
  | 'failed';

// ─── Verdict (outcome when state = 'finished') ────────────────────────────────

export type BotzoneVerdict =
  | 'Accepted'
  | 'WrongAnswer'
  | 'TimeLimitExceeded'
  | 'MemoryLimitExceeded'
  | 'RuntimeError'
  | 'CompileError'
  | 'SystemError'
  | 'OutputLimitExceeded'
  | 'PresentationError';

// ─── OJ result shapes ─────────────────────────────────────────────────────────

export interface BotzoneOJTestcase {
  id: number;
  verdict: BotzoneVerdict;
  actualOutput?: string;
  /** CPU time in milliseconds */
  timeMs?: number;
  /** Memory in kilobytes */
  memoryKb?: number;
  message?: string;
}

export interface BotzoneOJCompile {
  verdict: 'Ok' | 'Error';
  message?: string;
}

export interface BotzoneOJResult {
  verdict: BotzoneVerdict;
  testcases: BotzoneOJTestcase[];
  compile?: BotzoneOJCompile;
}

// ─── Botzone game result shapes ───────────────────────────────────────────────

export interface BotzoneGameRound {
  [key: string]: unknown;
}

export interface BotzoneGameResult {
  verdict: string;
  rounds?: BotzoneGameRound[];
  /** Bot scores: { [botId]: score } */
  finalResult?: Record<string, number>;
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

// ─── Poll response (GET /v1/judge/:jobId/status) ──────────────────────────────

export interface BotzonePollResponse {
  jobId: string;
  state: BotzoneJobState;
  type: 'oj' | 'botzone';
  finishedOn?: number;
  failedReason?: string;
  result?: BotzoneOJResult | BotzoneGameResult;
}

// ─── Callback body (POST /botzone/callback) ───────────────────────────────────

export interface BotzoneCallbackBody {
  jobId: string;
  correlationId: string;
  state: BotzoneJobState;
  type: 'oj' | 'botzone';
  result?: BotzoneOJResult | BotzoneGameResult;
}

// ─── Verdict → Leverage Status mapping ───────────────────────────────────────

export const BOTZONE_VERDICT_TO_LEVERAGE: Record<BotzoneVerdict, Status> = {
  Accepted: Status.AC,
  WrongAnswer: Status.WA,
  TimeLimitExceeded: Status.TLE,
  MemoryLimitExceeded: Status.MLE,
  RuntimeError: Status.RE,
  CompileError: Status.CE,
  SystemError: Status.SE,
  OutputLimitExceeded: Status.OLE,
  PresentationError: Status.PE,
};

// ─── State → Leverage Status mapping (for in-progress states) ────────────────

export const BOTZONE_STATE_TO_LEVERAGE: Record<BotzoneJobState, Status> = {
  pending: Status.PENDING,
  queued: Status.PENDING,
  compiling: Status.COMPILING,
  running: Status.JUDGING,
  finished: Status.SE, // terminal; caller should use verdict instead
  failed: Status.SE,
};

// ─── Terminal states ──────────────────────────────────────────────────────────

/** A job in one of these states has a final outcome and needs no further polling. */
export const BOTZONE_TERMINAL_STATES = new Set<BotzoneJobState>([
  'finished',
  'failed',
]);

// ─── Language mapping ─────────────────────────────────────────────────────────

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

// ─── Helper: map job state + optional result to leverage Status ───────────────

export function botzoneStateToStatus(
  state: BotzoneJobState,
  result?: BotzoneOJResult | BotzoneGameResult,
): Status {
  if (state === 'failed') return Status.SE;
  if (state === 'finished') {
    if (!result) return Status.SE;
    const verdict = (result as { verdict: string }).verdict as BotzoneVerdict;
    return BOTZONE_VERDICT_TO_LEVERAGE[verdict] ?? Status.SE;
  }
  return BOTZONE_STATE_TO_LEVERAGE[state] ?? Status.PENDING;
}
