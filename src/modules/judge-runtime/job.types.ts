import type { SandboxLanguage } from './sandbox.types';

export const INTERNAL_SUBMISSION_JOB = 'internal-submission';
export const INTERNAL_MATCH_JOB = 'internal-match';

/** Queue messages carry identity; the worker reads authoritative source/data. */
export interface SubmissionJob { submissionId: number; attemptId: string }
export interface MatchJob {
  matchId: number;
  gameId: number;
  requesterId?: number;
  judge?: { source: string; language: string };
  playerIds: number[];
}

export const submissionLanguage: Readonly<Record<number, SandboxLanguage>> = {
  0: 'c', 1: 'cpp11', 2: 'cpp14', 3: 'cpp', 9: 'python', 10: 'javascript', 11: 'typescript',
};
export function runtimeLanguage(value: string): SandboxLanguage | undefined {
  const aliases: Readonly<Record<string, SandboxLanguage>> = { python3: 'python', cpp17: 'cpp' };
  if (Object.prototype.hasOwnProperty.call(aliases, value)) return aliases[value];
  return ['python', 'cpp', 'cpp11', 'cpp14', 'c', 'javascript', 'typescript'].includes(value) ? value as SandboxLanguage : undefined;
}
