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
  | 'waiting'
  | 'active'
  | 'delayed'
  | 'paused'
  | 'completed'
  | 'pending'
  | 'queued'
  | 'compiling'
  | 'running'
  | 'finished'
  | 'failed';

// ─── Verdict (outcome when state = 'finished') ────────────────────────────────

export type BotzoneVerdict =
  | 'OK' | 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'SE' | 'NR' | 'NJ' | 'PE'
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
  verdict: 'OK' | 'CE' | 'Ok' | 'Error';
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
  type: 'oj';
  language: string;
  source: string;
  testcases: Array<{ id: number; input: string; expectedOutput: string }>;
  timeLimitMs: number;
  memoryLimitMb: number;
  callback: { finish: string };
  judgeMode: 'standard' | 'checker';
  checkerSource?: string;
  checkerLanguage?: string;
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
  finishedOn?: string | number;
  failedReason?: string;
  result?: BotzoneOJResult | BotzoneGameResult;
}

// ─── Callback body (POST /botzone/callback) ───────────────────────────────────

export interface BotzoneCallbackEnvelope {
  jobId: string;
  correlationId: string;
  state: BotzoneJobState;
  type: 'oj' | 'botzone';
  result?: BotzoneOJResult | BotzoneGameResult;
}

/** Upstream posts the raw OJResult to callback.finish, not the Bull envelope. */
export type BotzoneCallbackBody = BotzoneCallbackEnvelope | BotzoneOJResult;

// ─── Verdict → Leverage Status mapping ───────────────────────────────────────

export const BOTZONE_VERDICT_TO_LEVERAGE: Record<BotzoneVerdict, Status> = {
  OK: Status.SE, // compile success is not an accepted OJ answer
  AC: Status.AC,
  WA: Status.WA,
  TLE: Status.TLE,
  MLE: Status.MLE,
  RE: Status.RE,
  CE: Status.CE,
  SE: Status.SE,
  NR: Status.SE,
  NJ: Status.SE,
  PE: Status.PE,
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
  waiting: Status.PENDING,
  active: Status.JUDGING,
  delayed: Status.PENDING,
  paused: Status.PENDING,
  completed: Status.SE, // terminal; use result verdict instead
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
  'completed',
  'finished',
  'failed',
]);

// ─── Language mapping ─────────────────────────────────────────────────────────

/** Botzone language codes (leverage language int → botzone language string) */
export const LEVERAGE_LANG_TO_BOTZONE: Record<number, string> = {
  // Upstream compiles with -std=c++17; do not silently upgrade C++11/14.
  3: 'cpp',
  9: 'python',
  10: 'javascript',
  11: 'typescript',
};

/** Four canonical Botzone runtimes; only two established aliases are accepted. */
export function resolveBotzoneLanguage(value: string): 'cpp' | 'python' | 'javascript' | 'typescript' | undefined {
  switch (value) {
    case 'cpp': case 'cpp17': return 'cpp';
    case 'python': case 'python3': return 'python';
    case 'javascript': return 'javascript';
    case 'typescript': return 'typescript';
    default: return undefined;
  }
}

// ─── Helper: map job state + optional result to leverage Status ───────────────

export function botzoneStateToStatus(
  state: BotzoneJobState,
  result?: BotzoneOJResult | BotzoneGameResult,
): Status {
  if (state === 'failed') return Status.SE;
  if (state === 'finished' || state === 'completed') {
    if (!result) return Status.SE;
    const verdict = (result as { verdict: string }).verdict as BotzoneVerdict;
    if ('compile' in result && result.compile?.verdict === 'CE') return Status.CE;
    return Object.prototype.hasOwnProperty.call(BOTZONE_VERDICT_TO_LEVERAGE, verdict)
      ? BOTZONE_VERDICT_TO_LEVERAGE[verdict]
      : Status.SE;
  }
  return BOTZONE_STATE_TO_LEVERAGE[state] ?? Status.PENDING;
}
