import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import {
  SandboxError,
  type CompiledProgram,
  type ProgramSession,
  type SandboxLanguage,
  type SandboxLimits,
  type SandboxResult,
} from './sandbox.types';

const exec = promisify(execFile);
const PREFIX = 'leverage-judge-';
const MAX_SOURCE = 256 * 1024;
const MAX_ARTIFACT = 4 * 1024 * 1024;
const MAX_FILES = 16;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ARGS = 16;
const MAX_ARG_BYTES = 16 * 1024;
const MAX_SESSION_LIFETIME = 300_000;
const MAX_CONCURRENT = 4;
let active = 0;

const compile: Record<
  SandboxLanguage,
  { file: string; command: string; artifact: string }
> = {
  python: {
    file: 'main.py',
    command: 'python3 -m py_compile /tmp/main.py',
    artifact: 'main.py',
  },
  javascript: {
    file: 'main.js',
    command: 'node --check /tmp/main.js',
    artifact: 'main.js',
  },
  typescript: {
    file: 'main.ts',
    command:
      'tsc --target es2022 --module commonjs --skipLibCheck --types node --typeRoots /usr/local/lib/node_modules/@types --outDir /tmp/out /tmp/main.ts',
    artifact: 'out/main.js',
  },
  c: {
    file: 'main.c',
    command: 'gcc -O0 -pipe /tmp/main.c -o /tmp/program',
    artifact: 'program',
  },
  cpp: {
    file: 'main.cpp',
    command: 'g++ -std=c++17 -O2 -DONLINE_JUDGE -pipe /tmp/main.cpp -o /tmp/program',
    artifact: 'program',
  },
  cpp11: {
    file: 'main.cpp',
    command: 'g++ -std=c++11 -O2 -DONLINE_JUDGE -pipe /tmp/main.cpp -o /tmp/program',
    artifact: 'program',
  },
  cpp14: {
    file: 'main.cpp',
    command: 'g++ -std=c++14 -O2 -DONLINE_JUDGE -pipe /tmp/main.cpp -o /tmp/program',
    artifact: 'program',
  },
};

// Python reads exactly the artifact frame with os.read (not buffered stdin), then execs
// the language runtime with the remaining stdin unchanged. Neither source nor test input
// appears in argv, environment, host filesystem or an attached volume.
export const BOOT = `import os,sys
def read_exact(n):
 b=bytearray()
 while len(b)<n:
  chunk=os.read(0,n-len(b))
  if not chunk: sys.exit(71)
  b.extend(chunk)
 return bytes(b)
n=int.from_bytes(read_exact(4),'big')
f=open('/tmp/program','wb')
while n:
 b=os.read(0,min(n,65536))
 if not b: sys.exit(71)
 f.write(b); n-=len(b)
f.close()
os.chmod('/tmp/program',0o700)
lang=sys.argv[1]
args=[]
if sys.argv[2]=='run':
 import json
 size=int.from_bytes(read_exact(4),'big')
 context=json.loads(read_exact(size)) if size else {'files':{},'args':[]}
 for name,contents in context['files'].items():
  with open('/tmp/'+name,'xb') as dest: dest.write(contents.encode('utf-8'))
 args=context['args']
cmd={'python':['python3','-u','/tmp/program'],'javascript':['node','/tmp/program'],'typescript':['node','/tmp/program'],'native':['/tmp/program']}[lang]
os.write(2,b'__LEVERAGE_READY__\\n')
os.execvp(cmd[0],cmd+args)
`;

function claim(): () => void {
  if (active >= MAX_CONCURRENT)
    throw new SandboxError('SE', 'Judge concurrency limit reached');
  active++;
  let released = false;
  return () => {
    if (!released) {
      active--;
      released = true;
    }
  };
}
function validLimits(l: SandboxLimits): void {
  if (
    !Number.isSafeInteger(l.timeLimitMs) ||
    l.timeLimitMs < 1 ||
    l.timeLimitMs > 60_000 ||
    !Number.isSafeInteger(l.memoryLimitMb) ||
    l.memoryLimitMb < 32 ||
    l.memoryLimitMb > 1024 ||
    !Number.isSafeInteger(l.outputLimitBytes) ||
    l.outputLimitBytes < 1 ||
    l.outputLimitBytes > 1024 * 1024
  )
    throw new SandboxError('SE', 'Invalid sandbox limits');
}
async function command(args: string[]): Promise<string> {
  const { stdout } = await exec('docker', args, {
    timeout: 10_000,
    maxBuffer: 64 * 1024,
  });
  return stdout;
}
async function remove(name: string): Promise<void> {
  await command(['rm', '-f', '-v', name]);
}
// Docker CLI stats report a rounded, cache-adjusted container memory usage,
// not a process RSS or an exact cgroup peak. Reject malformed/zero readings.
function statsMemoryKb(raw: string, id: string, name: string): number | undefined {
  try {
    const stats = JSON.parse(raw.trim());
    if (stats.ID !== id || stats.Container !== id || stats.Name !== name ||
        typeof stats.MemUsage !== 'string') return undefined;
    const match = /^(\d+(?:\.\d+)?)(B|kB|KiB|MB|MiB|GB|GiB|TB|TiB)\s*\//.exec(stats.MemUsage);
    if (!match) return undefined;
    const units: Record<string, number> = {
      B: 1, kB: 1000, KiB: 1024, MB: 1e6, MiB: 1024 ** 2,
      GB: 1e9, GiB: 1024 ** 3, TB: 1e12, TiB: 1024 ** 4,
    };
    const bytes = Number(match[1]) * units[match[2]];
    return Number.isFinite(bytes) && bytes > 0 && bytes <= 1024 ** 4
      ? Math.ceil(bytes / 1024) : undefined;
  } catch {
    return undefined;
  }
}
function frame(bytes: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  return Buffer.concat([header, bytes]);
}

function contextFrame(context?: { files: Record<string, string>; args: string[] }): Buffer {
  if (!context) return frame(Buffer.alloc(0));
  if (!context.files || typeof context.files !== 'object' || Array.isArray(context.files) ||
      !Array.isArray(context.args))
    throw new SandboxError('SE', 'Invalid run context');
  const entries = Object.entries(context.files);
  if (entries.length > MAX_FILES || context.args.length > MAX_ARGS)
    throw new SandboxError('SE', 'Run context count exceeded');
  let bytes = 0;
  for (const [name, contents] of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name) || name.includes('..') || name === 'program' ||
        typeof contents !== 'string')
      throw new SandboxError('SE', 'Invalid run context file');
    bytes += Buffer.byteLength(contents);
    if (bytes > MAX_FILE_BYTES) throw new SandboxError('SE', 'Run context files exceed 1 MiB');
  }
  let argBytes = 0;
  for (const arg of context.args) {
    if (typeof arg !== 'string' || arg.includes('\0'))
      throw new SandboxError('SE', 'Invalid run argument');
    const size = Buffer.byteLength(arg);
    if (size > 4096) throw new SandboxError('SE', 'Run argument exceeds 4096 bytes');
    argBytes += size;
    if (argBytes > MAX_ARG_BYTES) throw new SandboxError('SE', 'Run arguments exceed 16 KiB');
  }
  return frame(Buffer.from(JSON.stringify({ files: Object.fromEntries(entries), args: context.args })));
}

interface Exit {
  code: number | null;
  oom: boolean;
  infra: boolean;
}
class Container {
  readonly name = PREFIX + randomUUID();
  readonly started = Date.now();
  readonly done: Promise<Exit>;
  readonly ready: Promise<void>;
  private resolveDone!: (value: Exit) => void;
  private resolveReady!: () => void;
  private child?: ChildProcessWithoutNullStreams;
  private timer?: NodeJS.Timeout;
  private setupTimer?: NodeJS.Timeout;
  private readyPending = Buffer.alloc(0);
  private booted = false;
  private readyAt?: number;
  private exitAt?: number;
  private onAbort?: () => void;
  private stopped?: 'TLE' | 'OLE' | 'SE' | 'CANCELLED';
  private ended = false;

  private created = false;
  private id?: string;
  private statsChild?: ReturnType<typeof execFile>;
  private statsTimer?: NodeJS.Timeout;
  private sampledMemoryKb?: number;
  private bytes = 0;
  private out: Buffer[] = [];
  private err: Buffer[] = [];
  private listeners = new Set<() => void>();

  constructor(
    private readonly image: string,
    private readonly limits: SandboxLimits,
    private readonly signal: AbortSignal | undefined,
    private readonly release: () => void,
    readonly requiresReady = false,
    private readonly runtimeMs = limits.timeLimitMs,
  ) {
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }
  get status(): typeof this.stopped {
    return this.stopped;
  }
  get isEnded(): boolean {
    return this.ended;
  }
  get isReady(): boolean {
    return this.booted;
  }
  get executionMs(): number | undefined {
    return this.readyAt === undefined || this.exitAt === undefined
      ? undefined : Math.max(0, this.exitAt - this.readyAt);
  }
  get memoryKb(): number | undefined {
    return this.sampledMemoryKb;
  }
  // One host-side Docker stats request at a time, at most one new request per
  // second after completion. Never run an observer inside the limited container.
  private observe(): void {
    if (!this.id || !this.booted || this.stopped || this.ended || this.exitAt !== undefined) return;
    this.statsChild = execFile('docker', [
      'stats', '--no-stream', '--no-trunc', '--format', '{{json .}}', this.id,
    ], { timeout: 3000, maxBuffer: 4096 }, (error, stdout) => {
      this.statsChild = undefined;
      if (this.ended || this.stopped || this.exitAt !== undefined) return;
      if (!error) {
        const kb = statsMemoryKb(stdout, this.id!, this.name);
        if (kb !== undefined) this.sampledMemoryKb = Math.max(this.sampledMemoryKb ?? kb, kb);
      }
      this.statsTimer = setTimeout(() => this.observe(), 1000);
    });
  }
  private stopObservation(): void {
    if (this.statsTimer) clearTimeout(this.statsTimer);
    this.statsTimer = undefined;
    this.statsChild?.kill();
    this.statsChild = undefined;
  }

  get stdout(): Buffer {
    return Buffer.concat(this.out);
  }
  get stderr(): string {
    return Buffer.concat(this.err).toString('utf8');
  }
  watch(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  private notify(): void {
    for (const callback of this.listeners) callback();
  }
  stop(reason: 'TLE' | 'OLE' | 'SE' | 'CANCELLED'): void {
    if (this.ended || this.stopped) return;
    this.stopped = reason;
    this.stopObservation();
    this.notify();
    if (this.created)
      void remove(this.name).catch(() => {
        this.child?.kill();
      });
  }
  async open(args: string[]): Promise<void> {
    this.onAbort = () => this.stop('CANCELLED');
    this.signal?.addEventListener('abort', this.onAbort, { once: true });
    // Runtime budget starts only after artifact transfer; setup has its own deadline.
    if (this.requiresReady)
      this.setupTimer = setTimeout(() => this.stop('SE'), 25_000);
    else
      this.timer = setTimeout(() => this.stop('TLE'), this.limits.timeLimitMs);
    if (this.signal?.aborted) this.stop('CANCELLED');
    try {
      // --pull=never prevents Docker from implicitly fetching an unknown image.
      // No host binds, inherited application env, daemon socket or privileged flags.
      const m = `${this.limits.memoryLimitMb}m`;
      const id = (await command([
        'create',
        '--pull=never',
        '-i',
        '--name',
        this.name,
        '--network=none',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--memory=' + m,
        '--memory-swap=' + m,
        '--cpus=0.5',
        '--pids-limit=32',
        '--read-only',
        '--tmpfs=/tmp:rw,exec,nosuid,nodev,size=32m,mode=1777',
        '--user=65534:65534',
        '--ipc=none',
        '--ulimit=nofile=64:64',
        '--log-driver=none',
        '--workdir=/tmp',
        this.image,
        ...args,
      ])).trim();
      this.created = true;
      if (!/^[a-f0-9]{64}$/.test(id))
        throw new SandboxError('SE', 'Docker create returned an invalid container ID');
      this.id = id;
      if (this.stopped) {
        await this.finish({ code: null, oom: false, infra: false });
        return;
      }
      this.child = spawn('docker', ['start', '-ai', this.name], {
        stdio: 'pipe',
      });
      this.child.stdout.on('data', (chunk: Buffer) =>
        this.capture(chunk, this.out),
      );
      this.child.stderr.on('data', (chunk: Buffer) =>
        this.captureStderr(chunk),
      );
      this.child.on('error', () => {
        void this.finish({ code: null, oom: false, infra: true });
      });
      this.child.on('close', () => {
        this.exitAt = performance.now();
        this.stopObservation();
        void this.inspectAndFinish();
      });
    } catch (e) {
      await this.finish({ code: null, oom: false, infra: true });
      if (!this.stopped)
        throw new SandboxError('SE', `Docker create failed: ${String(e)}`);
    }
  }
  private capture(chunk: Buffer, target: Buffer[]): void {
    if (this.ended) return;
    const remain = Math.max(0, this.limits.outputLimitBytes - this.bytes);
    target.push(chunk.subarray(0, remain));
    this.bytes += chunk.length;
    this.notify();
    if (chunk.length > remain) this.stop('OLE');
  }
  private captureStderr(chunk: Buffer): void {
    if (!this.requiresReady || this.booted) {
      this.capture(chunk, this.err);
      return;
    }
    const marker = Buffer.from('__LEVERAGE_READY__\n');
    this.readyPending = Buffer.concat([this.readyPending, chunk]);
    if (
      this.readyPending.length < marker.length &&
      marker.subarray(0, this.readyPending.length).equals(this.readyPending)
    )
      return;
    if (this.readyPending.subarray(0, marker.length).equals(marker)) {
      const rest = this.readyPending.subarray(marker.length);
      this.readyPending = Buffer.alloc(0);
      this.booted = true;
      this.readyAt = performance.now();
      clearTimeout(this.setupTimer);
      this.timer = setTimeout(() => this.stop('TLE'), this.runtimeMs);
      this.resolveReady();
      this.observe();
      if (rest.length) this.capture(rest, this.err);
    } else {
      this.capture(this.readyPending, this.err);
      this.readyPending = Buffer.alloc(0);
    }
  }
  async write(data: Buffer, end = false): Promise<void> {
    if (this.stopped || this.ended)
      throw new SandboxError(this.stopped ?? 'SE', this.stderr);
    const stdin = this.child?.stdin;
    if (!stdin || stdin.destroyed)
      throw new SandboxError('SE', 'Container input closed');
    await Promise.race([
      new Promise<void>((resolve, reject) =>
        stdin.write(data, (e) => (e ? reject(e) : resolve())),
      ),
      this.done.then(() => {
        throw new SandboxError(
          this.stopped ?? 'SE',
          this.stderr || 'Container closed while writing',
        );
      }),
    ]);
    if (end) stdin.end();
  }
  private async inspectAndFinish(): Promise<void> {
    if (this.ended) return;
    let exit: Exit = { code: null, oom: false, infra: true };
    try {
      const state = JSON.parse(
        await command(['inspect', '--format', '{{json .State}}', this.name]),
      );
      if (
        !state.Running &&
        typeof state.ExitCode === 'number' &&
        state.StartedAt !== '0001-01-01T00:00:00Z'
      )
        exit = {
          code: state.ExitCode,
          oom: state.OOMKilled === true,
          infra: false,
        };
    } catch {
      /* no reliable execution state: infrastructure failure */
    }
    await this.finish(exit);
  }
  private async finish(exit: Exit): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.stopObservation();
    if (this.timer) clearTimeout(this.timer);
    if (this.setupTimer) clearTimeout(this.setupTimer);
    if (this.onAbort) this.signal?.removeEventListener('abort', this.onAbort);
    try {
      await remove(this.name);
    } catch {
      exit.infra = true;
    }
    this.child?.kill();
    this.release();
    this.resolveReady();
    this.resolveDone(exit);
    this.notify();
  }
}

function classify(c: Container, exit: Exit): SandboxResult['status'] {
  if (c.status) return c.status;
  if (c.requiresReady && !c.isReady) return 'SE';
  if (exit.infra) return 'SE';
  if (exit.oom) return 'MLE';
  return exit.code === 0 ? 'OK' : 'RE';
}

export class DockerSandbox {
  constructor(private readonly options: { image: string }) {
    if (!options.image || options.image.startsWith('-'))
      throw new SandboxError('SE', 'Invalid image');
  }
  async prepare(
    input: { language: SandboxLanguage; source: string },
    signal?: AbortSignal,
  ): Promise<CompiledProgram> {
    const kind = compile[input.language];
    if (
      !kind ||
      typeof input.source !== 'string' ||
      Buffer.byteLength(input.source) > MAX_SOURCE
    )
      throw new SandboxError(
        'SE',
        'Unsupported language or source exceeds 256 KiB',
      );
    const release = claim();
    const c = new Container(
      this.options.image,
      {
        timeLimitMs: 30_000,
        memoryLimitMb: 512,
        outputLimitBytes: MAX_ARTIFACT + 1,
      },
      signal,
      release,
    );
    // Every character in this shell program comes from a fixed trusted map, not user data.
    const script = `cat > /tmp/${kind.file} || exit 71; ${kind.command}; rc=$?; if [ "$rc" -eq 126 ] || [ "$rc" -eq 127 ]; then exit 71; fi; if [ "$rc" -ne 0 ]; then exit 42; fi; cat /tmp/${kind.artifact} || exit 71`;
    try {
      await c.open(['sh', '-c', script]);
      if (!c.status) await c.write(Buffer.from(input.source), true);
      const exit = await c.done;
      if (c.status)
        throw new SandboxError(
          c.status === 'CANCELLED' ? 'CANCELLED' : 'SE',
          c.stderr || c.status,
        );
      if (exit.infra || exit.oom)
        throw new SandboxError(
          'SE',
          c.stderr || 'Compile infrastructure failure',
        );
      if (exit.code === 42) {
        if (
          /no space left on device|cannot allocate memory|killed signal terminated program|out of memory/i.test(
            c.stderr,
          )
        )
          throw new SandboxError('SE', c.stderr);
        throw new SandboxError('CE', c.stderr);
      }
      if (exit.code !== 0 || !c.stdout.length || c.stdout.length > MAX_ARTIFACT)
        throw new SandboxError(
          'SE',
          c.stderr || 'Compile artifact unavailable',
        );
      let artifact: Buffer | undefined = Buffer.from(c.stdout);
      const runKind =
        input.language === 'python' ||
        input.language === 'javascript' ||
        input.language === 'typescript'
          ? input.language
          : 'native';
      return {
        run: async (stdin, limits, runSignal, context) => {
          if (!artifact)
            throw new SandboxError('SE', 'Compiled program disposed');
          validLimits(limits);
          if (Buffer.byteLength(stdin) > 1024 * 1024)
            throw new SandboxError('SE', 'One-shot stdin exceeds 1 MiB');
          const extra = contextFrame(context);
          const releaseRun = claim();
          const run = new Container(
            this.options.image,
            limits,
            runSignal,
            releaseRun,
            true,
          );
          try {
            await run.open(['python3', '-u', '-c', BOOT, runKind, 'run']);
            if (!run.status) {
              try {
                await run.write(
                  Buffer.concat([frame(artifact), extra, Buffer.from(stdin)]),
                  true,
                );
              } catch {
                /* A program can exit before stdin is fully written; inspect its exit. */
              }
            }
            await run.ready;
            const state = await run.done;
            return {
              status: classify(run, state),
              stdout: run.stdout.toString('utf8'),
              stderr: run.stderr,
              exitCode: state.code,
              wallMs: Date.now() - run.started,
              executionMs: run.executionMs,
              memoryKb: run.memoryKb,
            };
          } catch (e) {
            if (!run.isEnded) run.stop('CANCELLED');
            const state = await run.done;
            return {
              status:
                run.status === 'CANCELLED' && !runSignal?.aborted
                  ? 'SE'
                  : classify(run, state),
              stdout: run.stdout.toString('utf8'),
              stderr: run.stderr || String(e),
              exitCode: state.code,
              wallMs: Date.now() - run.started,
              executionMs: run.executionMs,
              memoryKb: run.memoryKb,
            };
          }
        },
        startSession: async (limits, runSignal, options) => {
          if (!artifact)
            throw new SandboxError('SE', 'Compiled program disposed');
          validLimits(limits);
          const lifetimeMs = options?.lifetimeMs ?? MAX_SESSION_LIFETIME;
          if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > MAX_SESSION_LIFETIME)
            throw new SandboxError('SE', 'Invalid session lifetime');
          const releaseRun = claim();
          const run = new Container(
            this.options.image,
            limits,
            runSignal,
            releaseRun,
            true,
            lifetimeMs,
          );
          try {
            await run.open(['python3', '-u', '-c', BOOT, runKind, 'session']);
            if (!run.status) await run.write(frame(artifact));
            await run.ready;
            if (run.status)
              throw new SandboxError(run.status, run.stderr || run.status);
            if (!run.isReady)
              throw new SandboxError(
                'SE',
                run.stderr || 'Runtime bootstrap failed',
              );
            return new LineSession(run);
          } catch (e) {
            run.stop('CANCELLED');
            await run.done;
            throw e;
          }
        },
        dispose: () => {
          artifact = undefined;
        },
      };
    } catch (e) {
      // open/write may fail before the normal wait; always await container cleanup.
      c.stop('CANCELLED');
      await c.done;
      if (e instanceof SandboxError) throw e;
      throw new SandboxError('SE', String(e));
    }
  }
}

class LineSession implements ProgramSession {
  private consumed = 0;
  private closed = false;
  private reading = false;
  constructor(private readonly container: Container) {}
  async sendLine(line: string): Promise<void> {
    if (this.closed || line.includes('\n') || line.includes('\r'))
      throw new SandboxError(
        'SE',
        'Closed session or input is not a single line',
      );
    if (Buffer.byteLength(line) > 64 * 1024)
      throw new SandboxError('SE', 'Session line too long');
    if (this.container.status)
      throw new SandboxError(
        this.container.status,
        this.container.stderr || this.container.status,
      );
    if (this.container.isEnded) {
      const exit = await this.container.done;
      const result = classify(this.container, exit);
      throw new SandboxError(
        result === 'OK' ? 'RE' : result,
        'Program ended before input',
      );
    }
    try {
      await this.container.write(Buffer.from(line + '\n'));
    } catch {
      const exit = await this.container.done;
      const result = classify(this.container, exit);
      throw new SandboxError(
        result === 'OK' ? 'RE' : result,
        this.container.stderr || 'Program ended while writing input',
      );
    }
  }
  async readLine(timeoutMs: number): Promise<string> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
      throw new SandboxError('SE', 'Invalid read timeout');
    if (this.reading)
      throw new SandboxError('SE', 'Concurrent reads not supported');
    this.reading = true;
    try {
      const deadline = Date.now() + timeoutMs;
      while (true) {
        if (this.container.status)
          throw new SandboxError(
            this.container.status,
            this.container.stderr || this.container.status,
          );
        const output = this.container.stdout;
        const newline = output.indexOf(10, this.consumed);
        if (newline >= 0) {
          const result = output
            .subarray(this.consumed, newline)
            .toString('utf8');
          this.consumed = newline + 1;
          return result;
        }
        if (this.container.status)
          throw new SandboxError(
            this.container.status,
            this.container.stderr || this.container.status,
          );
        if (this.container.isEnded) {
          const exit = await this.container.done;
          const result = classify(this.container, exit);
          throw new SandboxError(result === 'OK' ? 'RE' : result,
            this.container.stderr || 'Program ended before a complete line');
        }
        await new Promise<void>((resolve) => {
          let settled = false;
          const wake = () => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              unwatch();
              resolve();
            }
          };
          const unwatch = this.container.watch(wake);
          const timer = setTimeout(wake, Math.max(1, deadline - Date.now()));
          // Recheck after registration to avoid missing a byte between snapshot and watch.
          if (
            this.container.stdout.length !== output.length ||
            this.container.status || this.container.isEnded
          )
            wake();
        });
        if (this.container.status)
          throw new SandboxError(
            this.container.status,
            this.container.stderr || this.container.status,
          );
        // done has settled when cleanup finished; no partial trailing line is a response.
        if (this.container.isEnded) {
          const exit = await this.container.done;
          const result = classify(this.container, exit);
          throw new SandboxError(
            result === 'OK' ? 'RE' : result,
            this.container.stderr || 'Program ended before a complete line',
          );
        }
        if (Date.now() >= deadline) {
          this.container.stop('TLE');
          await this.container.done;
          throw new SandboxError('TLE', 'Session read deadline exceeded');
        }
      }
    } finally {
      this.reading = false;
    }
  }
  async close(): Promise<void> {
    if (this.closed) {
      await this.container.done;
      return;
    }
    this.closed = true;
    this.container.stop('CANCELLED');
    await this.container.done;
  }
}
