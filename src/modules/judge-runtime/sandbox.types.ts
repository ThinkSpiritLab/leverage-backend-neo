export type SandboxLanguage =
  | 'python'
  | 'cpp'
  | 'cpp11'
  | 'cpp14'
  | 'c'
  | 'javascript'
  | 'typescript';

export interface SandboxLimits {
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitBytes: number;
}

export interface SandboxResult {
  status: 'OK' | 'RE' | 'TLE' | 'MLE' | 'OLE' | 'SE' | 'CANCELLED';
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** Host wall clock, including container creation, attach and cleanup. */
  wallMs: number;
  /** Host time from bootstrap READY to observed exit, not CPU time. */
  executionMs?: number;
  /** Max observed Docker stats memory usage (cache-adjusted), sampled after READY; not exact peak RSS. */
  memoryKb?: number;
  /** Not reported unless an independent cumulative CPU-time source is available. */
  cpuTimeMs?: number;
}

export interface ProgramSession {
  sendLine(line: string): Promise<void>;
  readLine(timeoutMs: number): Promise<string>;
  close(): Promise<void>;
}

export interface CompiledProgram {
  run(
    stdin: string,
    limits: SandboxLimits,
    signal?: AbortSignal,
    context?: { files: Record<string, string>; args: string[] },
  ): Promise<SandboxResult>;
  startSession(
    limits: SandboxLimits,
    signal?: AbortSignal,
    options?: { lifetimeMs?: number },
  ): Promise<ProgramSession>;
  dispose(): void;
}

/** Compile errors and infrastructure/cancellation failures; never disguise infrastructure as CE. */
export class SandboxError extends Error {
  constructor(
    public readonly status:
      | 'CE'
      | 'RE'
      | 'TLE'
      | 'MLE'
      | 'OLE'
      | 'SE'
      | 'CANCELLED',
    public readonly stderr: string,
  ) {
    super(stderr || status);
    this.name = 'SandboxError';
  }
}
