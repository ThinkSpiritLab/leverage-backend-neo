import { JudgeEngine, JudgeCancelled, equalOutput } from './judge-engine';
import { SandboxError } from './sandbox.types';
import { Status } from '../judge-runtime/judge-status';

const limits = { timeLimitMs: 1000, memoryLimitMb: 64, outputLimitBytes: 1024 };
const ok = (stdout: string) => ({ status: 'OK', stdout, stderr: '', exitCode: 0, wallMs: 500, executionMs: 3 });
const artifact = (stdout = '5\n') => ({ run: jest.fn(async (_input: string, ..._rest: unknown[]) => ok(stdout)), startSession: jest.fn(), dispose: jest.fn() });

describe('internal judge orchestration', () => {
  it('preserves leading spaces and ignores only trailing whitespace/empty lines', () => {
    expect(equalOutput('5\n', '5  \r\n\n')).toBe(true);
    expect(equalOutput(' 5\n', '5\n')).toBe(false);
    expect(equalOutput('5 6', '5   6')).toBe(false);
  });
  it('returns normalized AC, execution time, and no invented memory measurement', async () => {
    const program = artifact();
    const engine = new JudgeEngine({ prepare: jest.fn(async () => program) } as any);
    const result = await engine.submission({ program: { language: 'python', source: 'fixture' }, limits, cases: [{ id: 1, input: '2 3', expectedOutput: '5\n' }] });
    expect(result.status).toBe(Status.AC);
    expect(result.time).toBe(3);
    expect(result.memory).toBeUndefined();
    expect(program.dispose).toHaveBeenCalledTimes(1);
  });
  it('fails closed if a case is missing rather than accepting the remaining cases', async () => {
    const program = artifact();
    const engine = new JudgeEngine({ prepare: jest.fn(async () => program) } as any);
    async function* cases() { yield { id: 1, input: '', expectedOutput: '5' }; throw new Error('Missing case 2'); }
    const result = await engine.submission({ program: { language: 'python', source: 'fixture' }, limits, cases: cases() });
    expect(result.status).toBe(Status.SE);
    expect(JSON.parse(result.judgeResult!).testcases).toHaveLength(1);
  });
  it('does not start obsolete attempts', async () => {
    const prepare = jest.fn();
    const engine = new JudgeEngine({ prepare } as any);
    await expect(engine.submission({ program: { language: 'python', source: '' }, limits, cases: [] }, undefined, async () => false)).rejects.toThrow(JudgeCancelled);
    expect(prepare).not.toHaveBeenCalled();
  });
  it('separates user compilation errors from checker/infrastructure errors', async () => {
    const engine = new JudgeEngine({ prepare: jest.fn(async () => { throw new SandboxError('CE', 'syntax'); }) } as any);
    const result = await engine.submission({ program: { language: 'python', source: 'bad' }, limits, cases: [] });
    expect(result.status).toBe(Status.CE);
    expect(result.compileErrorMsg).toBe('syntax');
  });
  it('passes private expected output only to the separate checker and honors its exit code', async () => {
    const program = artifact();
    const checker = artifact();
    checker.run.mockResolvedValue({ ...ok(''), status: 'RE', exitCode: 2 } as any);
    const engine = new JudgeEngine({ prepare: jest.fn().mockResolvedValueOnce(program).mockResolvedValueOnce(checker) } as any);
    const result = await engine.submission({ program: { language: 'python', source: 'student' }, checker: { language: 'python', source: 'checker' }, limits, cases: [{ id: 1, input: 'input', expectedOutput: 'private-answer' }] });
    expect(result.status).toBe(Status.PE);
    expect(program.run.mock.calls[0][0]).toBe('input');
    expect((checker.run.mock.calls[0] as any)[3].files['expected.txt']).toBe('private-answer');
  });

  function matchFixture() {
    const session = { sendLine: jest.fn(async (_line: string) => {}), readLine: jest.fn()
      .mockResolvedValueOnce(JSON.stringify({ verdict: 'continue', commands: { '0': { value: 2 }, '1': { value: 3 } }, display: {} }))
      .mockResolvedValueOnce(JSON.stringify({ verdict: 'finish', scores: { '0': 1, '1': 0 }, display: {} })), close: jest.fn(async () => {}) };
    const judge = artifact(); judge.startSession.mockResolvedValue(session as never);
    const bot0 = artifact('{"move":2,"debug":"ok"}\n'), bot1 = artifact('3\n');
    const prepare = jest.fn().mockResolvedValueOnce(judge).mockResolvedValueOnce(bot0).mockResolvedValueOnce(bot1);
    const input: any = { matchId: 1, judge: { language: 'python', source: 'judge' }, limits, players: [
      { id: 101, userId: 10, type: 'code', program: { language: 'python', source: 'bot0' } },
      { id: 102, userId: 20, type: 'code', program: { language: 'python', source: 'bot1' } },
    ] };
    return { input, engine: new JudgeEngine({ prepare } as any), session, bot0, bot1, judge, prepare };
  }
  it('drives real protocol shape and maps positions back to actual gamer IDs', async () => {
    const f = matchFixture(); const result = await f.engine.match(f.input);
    expect(result.status).toBe('finished');
    expect(result.finalResult).toEqual({ '101': 1, '102': 0 });
    expect(f.bot0.run.mock.calls[0][0]).toBe('{"value":2}\n');
    expect(JSON.parse(f.session.sendLine.mock.calls[1][0])).toEqual({ round: 2, responses: { '0': 2, '1': 3 } });
    expect(f.session.close).toHaveBeenCalledTimes(1);
    expect(f.bot0.dispose).toHaveBeenCalledTimes(1);
  });
  it('does not settle arbitrary gamer IDs supplied by a judge', async () => {
    const f = matchFixture();
    f.session.readLine.mockReset().mockResolvedValue(JSON.stringify({ verdict: 'finish', scores: { '999': 1 } }));
    const result = await f.engine.match(f.input);
    expect(result.status).toBe('error'); expect(result.finalResult).toEqual({});
  });
  it('keeps existing zero-score forfeit semantics for an empty bot response', async () => {
    const f = matchFixture(); f.bot0.run.mockResolvedValue(ok(''));
    const result = await f.engine.match(f.input);
    expect(result.verdict).toBe('forfeit'); expect(result.finalResult).toEqual({ '101': 0, '102': 0 });
  });
  it('aborts outstanding interactive hooks when the match ends', async () => {
    const f = matchFixture(); f.input.players[0].type = 'human';
    const requestMove = jest.fn(async (_p: unknown, _state: unknown, signal: AbortSignal) => { expect(signal.aborted).toBe(false); return '2'; });
    const result = await f.engine.match(f.input, { requestMove });
    expect(result.status).toBe('finished');
    expect(requestMove.mock.calls[0][2].aborted).toBe(true);
  });
});
