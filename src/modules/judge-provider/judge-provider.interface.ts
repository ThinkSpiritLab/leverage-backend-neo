/**
 * JudgeProvider abstraction
 *
 * Defines the contract for external judge provider integrations.
 * Currently supported: 'heng' (default), 'botzone'
 */

export enum JudgeProviderName {
  Heng = 'heng',
  Botzone = 'botzone',
}

export interface EnqueueParams {
  submissionId: number;
  language: number;
  code: string;
  timeLimit: number;
  memoryLimit: number;
  /** URL for the backend to serve the test-data archive */
  testDataUrl: string;
  /** Optional: problem identifier on the external platform */
  externalProblemId?: string;
}

export interface EnqueueResult {
  /** Job ID on the external provider */
  externalJobId: string;
  /** Raw provider metadata to persist */
  providerMeta?: Record<string, unknown>;
}

export interface PollResult {
  /** Whether a terminal state has been reached */
  done: boolean;
  /** Leverage status (Status enum value) when done=true */
  status?: number;
  time?: number;
  memory?: number;
  /** JSON-serialized judge result for SubmissionMisc.judgeResult */
  judgeResult?: string;
  compileErrorMsg?: string;
  /**
   * Extra provider-specific metadata to persist in Submission.providerMeta.
   * For botzone game matches this contains `{ gameLog: { rounds, finalResult } }`.
   */
  providerMeta?: Record<string, unknown>;
}

/**
 * IJudgeProvider
 *
 * Every judge provider must implement this interface.
 */
export interface IJudgeProvider {
  readonly name: JudgeProviderName;

  /**
   * Submit a judge task to the external provider.
   * Returns the external job ID and optional metadata.
   */
  enqueue(params: EnqueueParams): Promise<EnqueueResult>;

  /**
   * Poll the provider for a result (used in fallback polling).
   * Return `done=false` if still running.
   */
  poll(submissionId: number, externalJobId: string): Promise<PollResult>;
}

/** Injection token for the provider registry */
export const JUDGE_PROVIDER_REGISTRY = 'JUDGE_PROVIDER_REGISTRY';
