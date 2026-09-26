/** Persisted submission verdict/status numbers; do not renumber historical records. */
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

/** Finalized internal OJ result, compatible with persisted SubmissionMisc data. */
export interface JudgeOutcome {
  done: boolean;
  status?: number;
  time?: number;
  memory?: number;
  judgeResult?: string;
  compileErrorMsg?: string;
  providerMeta?: Record<string, unknown>;
}
