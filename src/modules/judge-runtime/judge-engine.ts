import { Status } from '../judge-runtime/judge-status';
import type { JudgeOutcome } from './judge-status';
import { DockerSandbox } from './docker-sandbox';
import { SandboxError, type CompiledProgram, type ProgramSession, type SandboxLanguage, type SandboxResult } from './sandbox.types';
import type { MatchExecution, MatchHooks, MatchInput, SubmissionInput } from './judge.contracts';

export class JudgeCancelled extends Error { constructor(public readonly reason: 'superseded' | 'cancelled') { super(`Judge ${reason}`); } }
const statuses: Record<SandboxResult['status'], Status> = {
  OK: Status.AC, RE: Status.RE, TLE: Status.TLE, MLE: Status.MLE,
  OLE: Status.OLE, SE: Status.SE, CANCELLED: Status.SE,
};
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const preview = (v: string, max = 4096) => v.slice(0, max);

/** Same standard comparison as the established verdict comparison: trim line ends, not leading spaces. */
export function equalOutput(expected: string, actual: string): boolean {
  const normalize = (text: string) => {
    const lines = text.split('\n').map(line => line.trimEnd());
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines;
  };
  const a = normalize(expected), b = normalize(actual);
  return a.length === b.length && a.every((line, index) => line === b[index]);
}

function linkedDeadline(parent: AbortSignal | undefined, durationMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  parent?.addEventListener('abort', abort, { once: true });
  if (parent?.aborted) abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, durationMs);
  timer.unref();
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    close: () => { controller.abort(); clearTimeout(timer); parent?.removeEventListener('abort', abort); },
  };
}

/** No HTTP server, queue or database here: orchestration over the isolated execution primitive. */
export class JudgeEngine {
  constructor(private readonly sandbox: Pick<DockerSandbox, 'prepare'>,
    private readonly maxMatchMs = 300_000,
    private readonly maxRounds = 1000,
    private readonly maxTraceBytes = 4 * 1024 * 1024) {}

  async submission(input: SubmissionInput, signal?: AbortSignal,
    isCurrent: () => Promise<boolean> = async () => true, onRunning?: () => Promise<void>): Promise<JudgeOutcome> {
    const deadline = linkedDeadline(signal, this.maxMatchMs);
    let program: CompiledProgram | undefined, checker: CompiledProgram | undefined;
    const cases: Array<Record<string, unknown>> = [];
    let status = Status.AC;
    let time: number | undefined, memory: number | undefined;
    let stage: 'program' | 'checker' | 'run' = 'program';
    try {
      if (signal?.aborted) throw new JudgeCancelled('cancelled');
      if (!(await isCurrent())) throw new JudgeCancelled('superseded');
      program = await this.sandbox.prepare({ ...input.program, language: input.program.language as SandboxLanguage }, deadline.signal);
      if (input.checker) {
        stage = 'checker';
        checker = await this.sandbox.prepare({ ...input.checker, language: input.checker.language as SandboxLanguage }, deadline.signal);
      }
      stage = 'run';
      await onRunning?.();
      for await (const test of input.cases) {
        if (signal?.aborted) throw new JudgeCancelled('cancelled');
      if (!(await isCurrent())) throw new JudgeCancelled('superseded');
        const result = await program.run(test.input, input.limits, deadline.signal);
        if (result.status === 'CANCELLED') {
          if (deadline.timedOut()) throw new Error('Judge total execution budget exceeded');
          throw new JudgeCancelled('cancelled');
        }
        let verdict = statuses[result.status];
        let message = preview(result.stderr);
        if (verdict === Status.AC && checker) {
          const checked = await checker.run('', { timeLimitMs: 10_000, memoryLimitMb: 256, outputLimitBytes: 1024 * 1024 }, deadline.signal, {
            files: { 'input.txt': test.input, 'expected.txt': test.expectedOutput, 'actual.txt': result.stdout },
            args: ['input.txt', 'expected.txt', 'actual.txt'],
          });
          if (checked.status === 'CANCELLED') throw new JudgeCancelled('cancelled');
          if ((checked.status === 'OK' || checked.status === 'RE') && checked.exitCode === 0) verdict = Status.AC;
          else if (checked.status === 'RE' && checked.exitCode === 1) verdict = Status.WA;
          else if (checked.status === 'RE' && checked.exitCode === 2) verdict = Status.PE;
          else verdict = Status.SE;
          message = preview(checked.stderr || checked.stdout, 1000);
        } else if (verdict === Status.AC && !equalOutput(test.expectedOutput, result.stdout)) verdict = Status.WA;
        if (status === Status.AC && verdict !== Status.AC) status = verdict;
        // Missing measurements stay missing. Sandbox executionMs is observed wall execution, not CPU time.
        const executionMs = result.executionMs;
        const memoryBytes = result.memoryKb === undefined ? undefined : result.memoryKb * 1024;
        if (executionMs !== undefined) time = Math.max(time ?? 0, executionMs);
        if (memoryBytes !== undefined) memory = Math.max(memory ?? 0, memoryBytes);
        cases.push({ id: test.id, verdict: Status[verdict], time: executionMs, memory: memoryBytes,
          actualOutput: preview(result.stdout), outputTruncated: result.stdout.length > 4096, message });
      }
      if (!cases.length) throw new Error('No test cases configured');
      return { done: true, status, time, memory, judgeResult: JSON.stringify({ testcases: cases }),
        providerMeta: { engine: 'internal', timeAccounting: 'observed execution wall time', memoryAccounting: 'unavailable unless reported' } };
    } catch (error) {
      if (error instanceof JudgeCancelled) throw error;
      if (signal?.aborted) throw new JudgeCancelled('cancelled');
      const compileFailure = stage === 'program' && error instanceof SandboxError && error.status === 'CE';
      const text = compileFailure ? preview(error.stderr) : error instanceof Error ? error.message : 'Judge failure';
      return { done: true, status: compileFailure ? Status.CE : Status.SE,
        compileErrorMsg: compileFailure ? text : undefined,
        judgeResult: JSON.stringify({ testcases: cases, error: stage === 'checker' ? 'Checker compilation failed' : preview(text) }) };
    } finally {
      deadline.close();
      program?.dispose();
      checker?.dispose();
    }
  }

  async match(input: MatchInput, hooks: MatchHooks = {}): Promise<MatchExecution> {
    const deadline = linkedDeadline(hooks.signal, this.maxMatchMs);
    const compiled = new Map<number, CompiledProgram>();
    let judge: CompiledProgram | undefined, session: ProgramSession | undefined;
    const rounds: Array<Record<string, unknown>> = [];
    const compileMessages: Record<string, string> = {};
    let traceBytes = 0, preparing = 'judge';
    const history = input.players.map(() => ({ requests: [] as string[], responses: [] as string[] }));
    const score = (values: Record<string, number>) => Object.fromEntries(Object.entries(values).map(([position, value]) => [String(input.players[Number(position)].id), value]));
    const addRound = (round: Record<string, unknown>) => {
      traceBytes += Buffer.byteLength(JSON.stringify(round));
      if (traceBytes > this.maxTraceBytes) throw new Error('Match trace limit exceeded');
      rounds.push(round);
    };
    const current = async () => {
      if (hooks.signal?.aborted) throw new JudgeCancelled('cancelled');
      if (hooks.isCurrent && !(await hooks.isCurrent())) throw new JudgeCancelled('superseded');
      if (deadline.timedOut()) throw new Error('Match total execution budget exceeded');
    };
    try {
      if (input.players.length < 2) throw new Error('A match requires at least two players');
      await current();
      judge = await this.sandbox.prepare({ ...input.judge, language: input.judge.language as SandboxLanguage }, deadline.signal);
      for (let position = 0; position < input.players.length; position++) {
        const player = input.players[position];
        if (player.type !== 'code') continue;
        if (!player.program) throw new Error('Missing player source');
        preparing = String(position);
        compiled.set(position, await this.sandbox.prepare({ ...player.program, language: player.program.language as SandboxLanguage }, deadline.signal));
      }
      preparing = '';
      session = await judge.startSession({ ...input.limits, outputLimitBytes: 1024 * 1024 }, deadline.signal, { lifetimeMs: this.maxMatchMs });
      let responses: Record<string, unknown> = {};
      for (let round = 1; round <= this.maxRounds; round++) {
        await current();
        await session.sendLine(JSON.stringify({ round, responses }));
        const line = await session.readLine(input.limits.timeLimitMs);
        if (Buffer.byteLength(line) > 64 * 1024) throw new Error('Judge response frame too large');
        const output: unknown = JSON.parse(line);
        if (!object(output) || !['continue', 'finish', 'error'].includes(String(output.verdict))) throw new Error('Invalid judge verdict');
        if (output.verdict === 'error') throw new Error('Judge reported an error');
        if (output.verdict === 'finish') {
          const scores = output.scores ?? {};
          if (!object(scores) || Object.entries(scores).some(([key, value]) =>
            !/^\d+$/.test(key) || !input.players[Number(key)] || typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Invalid judge scores');
          addRound({ round, display: output.display, scores, debug: { judge: output.debug ?? null } });
          return { status: 'finished', verdict: 'OK', finalResult: score(scores as Record<string, number>), rounds, compileMessages };
        }
        if (!object(output.commands)) throw new Error('Judge commands must be an object');
        const commands = Object.entries(output.commands).filter(([, command]) => command != null);
        if (commands.some(([key]) => !/^\d+$/.test(key) || !input.players[Number(key)])) throw new Error('Unknown player in judge commands');
        responses = {};
        const debug: Record<string, unknown> = { judge: output.debug ?? null };
        // Human/external input can wait concurrently. Code runs sequentially so one
        // match cannot exhaust the process-wide sandbox budget by adding players.
        const waiting = new Map<string, Promise<string | null | Error>>();
        for (const [position, command] of commands) {
          const index = Number(position), player = input.players[index];
          const request = typeof command === 'string' ? command : JSON.stringify(command);
          history[index].requests.push(request);
          if (player.type !== 'code') {
            if (!hooks.requestMove) throw new Error('Interactive input is not configured');
            waiting.set(position, hooks.requestMove(player, { requests: [...history[index].requests], responses: [...history[index].responses] }, deadline.signal).catch(error => error instanceof Error ? error : new Error(String(error))));
          }
        }
        let forfeited: string | undefined;
        for (const [position, command] of commands) {
          const index = Number(position), player = input.players[index];
          await current();
          let response: string | null;
          if (player.type === 'code') {
            const request = typeof command === 'string' ? command : JSON.stringify(command);
            const result = await compiled.get(index)!.run(request + '\n', input.limits, deadline.signal);
            if (result.status === 'CANCELLED') { await current(); throw new JudgeCancelled('cancelled'); }
            if (result.status === 'SE') throw new Error('Player execution infrastructure failed');
            response = result.status === 'OK' ? result.stdout.trim().split('\n')[0] : null;
            debug[`bot_${position}_stderr`] = preview(result.stderr);
          } else { const received = await waiting.get(position)!; if (received instanceof Error) throw received; response = received; }
          let move: unknown = response;
          if (response !== null && response.trim().startsWith('{')) {
            try {
              const parsed: unknown = JSON.parse(response);
              if (object(parsed)) { move = 'move' in parsed ? parsed.move : parsed; debug[`bot_${position}`] = typeof parsed.debug === 'string' ? parsed.debug : null; }
            } catch { /* Preserve raw text, as the existing external protocol does. */ }
          } else if (response !== null && response.trim() !== '' && Number.isFinite(Number(response))) move = Number(response);
          if (move === null || move === undefined || move === '') forfeited ??= position;
          responses[position] = move;
          history[index].responses.push(response ?? '');
        }
        addRound({ round, judgeCmd: output.commands, display: output.display, botResponses: responses, debug });
        if (forfeited !== undefined) {
          // Preserve the existing external protocol's zero-score forfeit policy.
          const zero = Object.fromEntries(input.players.map(player => [String(player.id), 0]));
          return { status: 'finished', verdict: 'forfeit', finalResult: zero, rounds, compileMessages };
        }
      }
      throw new Error('Match round limit exceeded');
    } catch (error) {
      if (error instanceof JudgeCancelled) throw error;
      if (hooks.signal?.aborted) throw new JudgeCancelled('cancelled');
      if (preparing && error instanceof SandboxError && error.status === 'CE') compileMessages[preparing] = preview(error.stderr);
      return { status: 'error', verdict: 'error', finalResult: {}, rounds, compileMessages,
        error: deadline.timedOut() ? 'Match total execution budget exceeded' : preview(error instanceof Error ? error.message : 'Match failure') };
    } finally {
      deadline.close();
      await session?.close();
      judge?.dispose();
      for (const program of compiled.values()) program.dispose();
    }
  }
}
