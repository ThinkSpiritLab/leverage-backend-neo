import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOOT, DockerSandbox } from '../src/modules/judge-runtime/docker-sandbox';
import {
  SandboxError,
  type SandboxLimits,
} from '../src/modules/judge-runtime/sandbox.types';

const image = process.env.JUDGE_TEST_IMAGE || 'leverage-judge-runtime:local';
const sandbox = new DockerSandbox({ image });
const limits: SandboxLimits = {
  timeLimitMs: 5000,
  memoryLimitMb: 128,
  outputLimitBytes: 4096,
};
const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim();
async function fragmentedHeader(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'judge-frame-'));
  const child = spawn('python3', ['-u', '-c', BOOT.replaceAll('/tmp/program', join(dir, 'program')), 'python', 'session']);
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stdin.on('error', () => undefined); // old broken bootstrap closes stdin early
  const exit = new Promise<number | null>((resolve, reject) => {
    child.on('close', resolve);
    child.on('error', reject);
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 300)); // bootstrap waits on first header byte
    const source = Buffer.from('print("split header")\n');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(source.length);
    for (const byte of header) {
      child.stdin.write(Buffer.from([byte]));
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    child.stdin.end(source);
    const code = await Promise.race([exit, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('header test timed out')), 4000))]);
    assert.equal(code, 0);
    assert.equal(output, 'split header\n');
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}
async function status(
  p: Promise<unknown>,
  expected: SandboxError['status'],
): Promise<void> {
  await assert.rejects(
    p,
    (error: unknown) =>
      error instanceof SandboxError && error.status === expected,
  );
}
async function main(): Promise<void> {
  await fragmentedHeader();
  docker('image', 'inspect', image); // local image, never implicit pull
  const examples = [
    {
      language: 'python' as const,
      source: 'import sys\na,b=map(int,sys.stdin.read().split()); print(a+b)',
    },
    {
      language: 'cpp' as const,
      source:
        '#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}',
    },
    {
      language: 'javascript' as const,
      source:
        'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{let [a,b]=s.trim().split(" ").map(Number);console.log(a+b)})',
    },
    {
      language: 'typescript' as const,
      source:
        'enum Offset { Value = 1 }\nlet s: string = ""; process.stdin.on("data",(b: Buffer)=>s+=b);process.stdin.on("end",()=>{const [a,b]:number[]=s.trim().split(" ").map(Number);console.log(a+b+Offset.Value-1)})',
    },
  ];
  for (const input of examples) {
    const program = await sandbox.prepare(input);
    try {
      const result = await program.run('2 3\n', limits);
      assert.equal(
        result.status,
        'OK',
        `${input.language}: ${JSON.stringify(result)}`,
      );
      assert.equal(result.stdout, '5\n');
      // Fast runs may complete before the first host-side stats response.
      assert.ok(result.memoryKb === undefined || result.memoryKb > 0);
      assert.equal(result.cpuTimeMs, undefined); // no CPU-time oracle in CLI stats
      assert.ok(result.executionMs !== undefined && result.executionMs >= 0);
      assert.ok(result.wallMs >= result.executionMs);
      if (input.language === 'python') {
        const short = await program.run('2 3\n', {
          ...limits,
          timeLimitMs: 80,
        });
        assert.equal(
          short.status,
          'OK',
          'Docker create/attach must not consume run deadline',
        );
        assert.ok(
          short.wallMs >= 80,
          'wallMs includes host Docker management overhead',
        );
      }
      console.log(`${input.language}: ${result.status} (${result.wallMs} ms)`);
    } finally {
      program.dispose();
    }
  }
  const observed = await sandbox.prepare({
    language: 'python',
    source: 'import time\nx=bytearray(12*1024*1024);print("memoryKb=999999", flush=True);time.sleep(2)',
  });
  try {
    const measured = await observed.run('', limits);
    assert.equal(measured.status, 'OK');
    assert.equal(measured.stdout, 'memoryKb=999999\n'); // untrusted stdout cannot spoof stats
    assert.ok(measured.memoryKb !== undefined && measured.memoryKb > 12 * 1024 &&
      measured.memoryKb < limits.memoryLimitMb * 1024,
      `host sample missing or implausible: ${JSON.stringify(measured)}`);
    assert.equal(measured.cpuTimeMs, undefined);
    console.log(`sampled memory: ${measured.memoryKb} KiB, wall: ${measured.wallMs} ms`);
  } finally {
    observed.dispose();
  }
  await status(
    sandbox.prepare({ language: 'cpp', source: 'int main( {' }),
    'CE',
  );
  const compileAbort = new AbortController();
  compileAbort.abort();
  await status(
    sandbox.prepare(
      { language: 'python', source: 'print(1)' },
      compileAbort.signal,
    ),
    'CANCELLED',
  );
  const python = await sandbox.prepare({
    language: 'python',
    source: 'import sys\nfor line in sys.stdin: print(int(line)+1,flush=True)',
  });
  const session = await python.startSession(limits);
  try {
    const names = docker(
      'ps',
      '-a',
      '--filter',
      'name=leverage-judge-',
      '--format',
      '{{.Names}}',
    )
      .split('\n')
      .filter(Boolean);
    assert.equal(names.length, 1);
    const cfg = JSON.parse(
      docker('inspect', '--format', '{{json .HostConfig}}', names[0]),
    );
    assert.equal(cfg.NetworkMode, 'none');
    assert.deepEqual(cfg.CapDrop, ['ALL']);
    assert.ok(cfg.SecurityOpt.includes('no-new-privileges'));
    assert.equal(cfg.Privileged, false);
    assert.equal(cfg.ReadonlyRootfs, true);
    assert.equal(cfg.UsernsMode === 'host', false);
    assert.equal(cfg.IpcMode, 'none');
    assert.equal(cfg.Memory, 128 * 1024 * 1024);
    assert.equal(cfg.MemorySwap, cfg.Memory);
    assert.equal(cfg.Binds, null);
    assert.equal(cfg.Mounts?.length || 0, 0);
    assert.match(cfg.Tmpfs['/tmp'], /nosuid/);
    assert.match(cfg.Tmpfs['/tmp'], /nodev/);
    for (const n of ['2', '9']) {
      await session.sendLine(n);
      assert.equal(await session.readLine(2000), String(Number(n) + 1));
    }
  } finally {
    await session.close();
    await session.close();
    python.dispose();
  }
  const failure = await sandbox.prepare({
    language: 'python',
    source: 'raise RuntimeError("boom")',
  });
  assert.equal((await failure.run('', limits)).status, 'RE');
  failure.dispose();
  const infinite = await sandbox.prepare({
    language: 'python',
    source: 'while True: pass',
  });
  assert.equal(
    (await infinite.run('', { ...limits, timeLimitMs: 500 })).status,
    'TLE',
  );
  const abort = new AbortController();
  const pending = infinite.run('', limits, abort.signal);
  setTimeout(() => abort.abort(), 200);
  assert.equal((await pending).status, 'CANCELLED');
  infinite.dispose();
  const hungry = await sandbox.prepare({
    language: 'python',
    source: 'x=bytearray(512*1024*1024);print(len(x))',
  });
  assert.equal(
    (await hungry.run('', { ...limits, memoryLimitMb: 64 })).status,
    'MLE',
  );
  hungry.dispose();
  const noisy = await sandbox.prepare({
    language: 'python',
    source: 'print("x"*50000)',
  });
  assert.equal(
    (await noisy.run('', { ...limits, outputLimitBytes: 200 })).status,
    'OLE',
  );
  noisy.dispose();
  const network = await sandbox.prepare({
    language: 'python',
    source:
      'import os,socket\nprint(os.path.exists("/var/run/docker.sock"), os.path.exists("/Users/yuzhe/.env"))\ns=socket.socket();s.settimeout(1);s.connect(("1.1.1.1",53))',
  });
  const isolated = await network.run('', limits);
  assert.equal(isolated.status, 'RE');
  assert.equal(isolated.stdout, 'False False\n');
  assert.match(isolated.stderr, /Network is unreachable/);
  network.dispose();
  const eof = await sandbox.prepare({ language: 'python', source: 'pass' });
  const eofSession = await eof.startSession(limits);
  await status(eofSession.readLine(1000), 'RE');
  const eofStart = Date.now();
  await status(eofSession.readLine(3000), 'RE');
  assert.ok(Date.now() - eofStart < 1000, 'ended session EOF must not wait for read timeout');
  await eofSession.close();
  eof.dispose();
  const flood = await sandbox.prepare({
    language: 'python',
    source:
      'import time\nwhile True: print("x"*2000, flush=True); time.sleep(.01)',
  });
  const flooded = await flood.startSession({
    ...limits,
    outputLimitBytes: 100,
  });
  await status(flooded.readLine(2000), 'OLE');
  await flooded.close();
  flood.dispose();
  const cancelSession = new AbortController();
  const idle = await sandbox.prepare({
    language: 'python',
    source: 'import time\ntime.sleep(10)',
  });
  const sleeping = await idle.startSession(limits, cancelSession.signal);
  cancelSession.abort();
  await status(sleeping.readLine(1000), 'CANCELLED');
  await sleeping.close();
  idle.dispose();
  const slow = await sandbox.prepare({
    language: 'python',
    source: 'import time; time.sleep(10)',
  });
  const timed = await slow.startSession(limits);
  await status(timed.readLine(100), 'TLE');
  await timed.close();
  slow.dispose();
  const interactive = await sandbox.prepare({
    language: 'python',
    source: 'import sys\nfor line in sys.stdin: print(line.strip(),flush=True)',
  });
  const longSession = await interactive.startSession({ ...limits, timeLimitMs: 1000 }, undefined, { lifetimeMs: 4000 });
  await new Promise((resolve) => setTimeout(resolve, 1300));
  await longSession.sendLine('still here');
  assert.equal(await longSession.readLine(1000), 'still here');
  await longSession.close();
  await status(interactive.startSession(limits, undefined, { lifetimeMs: 300001 }), 'SE');
  interactive.dispose();

  const checkerSource = 'import sys,pathlib\na,b,c=(pathlib.Path(x).read_text().strip() for x in sys.argv[1:])\nraise SystemExit(2 if not c.isdigit() else 0 if a==b==c else 1)';
  const checkerCpp = '#include <fstream>\n#include <string>\n#include <nlohmann/json.hpp>\n#ifndef ONLINE_JUDGE\n#error Missing judge macro\n#endif\nint main(int argc,char** argv){if(argc!=4)return 2;std::string s[3];for(int i=0;i<3;i++){std::ifstream f(argv[i+1]);f>>s[i];}try{nlohmann::json::parse(s[2]);}catch(...){return 2;}return s[0]==s[1]&&s[1]==s[2]?0:1;}';
  for (const [language, source] of [['python', checkerSource], ['cpp', checkerCpp]] as const) {
    const checker = await sandbox.prepare({ language, source });
    const ctx = (actual: string) => ({ files: { 'input.txt': '42', 'expected.txt': '42', 'actual.txt': actual }, args: ['input.txt', 'expected.txt', 'actual.txt'] });
    for (const [actual, code] of [['42', 0], ['43', 1], ['not_json', 2]] as const) {
      const result = await checker.run('', limits, undefined, ctx(actual));
      assert.equal(result.exitCode, code, `${language} checker: ${JSON.stringify(result)}`);
      assert.equal(result.status, code === 0 ? 'OK' : 'RE');
      assert.ok(result.executionMs !== undefined && result.wallMs >= result.executionMs);
    }
    await status(checker.run('', limits, undefined, { files: { '../expected.txt': '42' }, args: [] }), 'SE');
    await status(checker.run('', limits, undefined, { files: { 'a..b': '42' }, args: [] }), 'SE');
    await status(checker.run('', limits, undefined, { files: { 'program': '42' }, args: [] }), 'SE');
    await status(checker.run('', limits, undefined, { files: { 'huge.txt': 'x'.repeat(1024 * 1024 + 1) }, args: [] }), 'SE');
    await status(checker.run('', limits, undefined, { files: {}, args: Array(17).fill('x') }), 'SE');
    await status(checker.run('', { ...limits, memoryLimitMb: 1025 }), 'SE');
    checker.dispose();
  }
  const student = await sandbox.prepare({ language: 'python', source: 'import os,sys\nprint(os.path.exists("expected.txt"),len(sys.argv))' });
  const studentResult = await student.run('', limits);
  assert.equal(studentResult.stdout, 'False 1\n');
  student.dispose();
  const unicode = await sandbox.prepare({ language: 'python', source: '#' + '🙂'.repeat(65530) + '\nprint("unicode")' });
  assert.equal((await unicode.run('', limits)).stdout, 'unicode\n');
  unicode.dispose();
  // A tiny configured lifetime expires independently of the per-turn read deadline.
  const lifetime = await sandbox.prepare({ language: 'python', source: 'import time\ntime.sleep(10)' });
  const expiring = await lifetime.startSession(limits, undefined, { lifetimeMs: 300 });
  await status(expiring.readLine(3000), 'TLE');
  await expiring.close();
  lifetime.dispose();
  await status(
    new DockerSandbox({ image: 'missing-judge-runtime:image' }).prepare({
      language: 'python',
      source: 'print(1)',
    }),
    'SE',
  );
  assert.equal(
    docker(
      'ps',
      '-a',
      '--filter',
      'name=leverage-judge-',
      '--format',
      '{{.Names}}',
    ),
    '',
  );
  console.log(
    'CE/RE/TLE/OLE/CANCELLED, SPJ AC/WA/PE, session lifecycle/EOF, timing, isolation and cleanup: OK',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
