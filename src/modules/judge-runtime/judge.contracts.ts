import type { SandboxLimits } from './sandbox.types';

export interface ProgramSource { language: string; source: string }
export interface JudgeCase { id: number; input: string; expectedOutput: string }
export interface SubmissionInput {
  program: ProgramSource;
  cases: AsyncIterable<JudgeCase> | Iterable<JudgeCase>;
  limits: SandboxLimits;
  checker?: ProgramSource;
}
export interface MatchPlayer {
  id: number;
  userId?: number;
  type: 'code' | 'human' | 'external' | 'webhook';
  program?: ProgramSource;
  webhookUrl?: string;
  webhookSecret?: string;
  timeoutMs?: number;
}
export interface MatchInput {
  matchId: number;
  judge: ProgramSource;
  players: MatchPlayer[];
  limits: SandboxLimits;
}
export interface MatchHooks {
  signal?: AbortSignal;
  isCurrent?: () => Promise<boolean>;
  requestMove?: (player: MatchPlayer, gameState: unknown, signal: AbortSignal) => Promise<string | null>;
}
export interface MatchExecution {
  status: 'finished' | 'error';
  verdict: string;
  finalResult: Record<string, number>;
  rounds: Array<Record<string, unknown>>;
  compileMessages: Record<string, string>;
  error?: string;
}
