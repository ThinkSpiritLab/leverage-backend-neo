# Internal Docker judge primitive

`DockerSandbox` is a low-level adapter for trusted backend worker code, not a public judge API or a game/OJ orchestrator. No credentials, Docker socket, host paths or bind mounts enter the sandbox. Student submissions never receive expected answers; checker programs receive only their testcase files in a separate tmpfs. The worker process itself **must** be trusted because it controls the Docker daemon.

## Build and verify locally

```sh
# Builds with an empty context: repository files and .env never enter the image.
pnpm judge:image
pnpm exec ts-node --transpile-only test/judge-sandbox.ts
pnpm test:unit --runInBand --runTestsByPath src/modules/judge-runtime/docker-sandbox.spec.ts
pnpm exec tsc --noEmit --incremental false
```

A local macOS Docker Desktop / Linux arm64 build measured **187,111,039 bytes**; this is not a cross-platform image-size cap. Recheck the image ID and size with `docker image inspect` after rebuilding. Keep the image; the adapter uses `docker create --pull=never` and will not pull an unknown tag. Build once per target architecture, pin the resulting digest for deployment rather than relying on the mutable `node:22-bookworm-slim` base tag. The image includes Python 3, GCC/G++, `nlohmann-json3-dev`, Node 22, TypeScript **5.9.3** and `@types/node` **22.18.6**. TypeScript uses actual `tsc` (including `enum`), not Node's strip-types mode. The sandbox adapter itself adds no third-party backend dependency; the separate testcase ZIP upload uses `yauzl`.

## Contract

```ts
const sandbox = new DockerSandbox({ image: 'leverage-judge-runtime:local' });
const program = await sandbox.prepare({ language: 'python', source }, signal);
try {
  const result = await program.run(stdin, { timeLimitMs: 1000, memoryLimitMb: 128, outputLimitBytes: 4096 }, signal);
  // Internal testlib checker only: await program.run('', limits, signal,
  //   { files: { 'input.txt': input, 'expected.txt': expected, 'actual.txt': actual },
  //     args: ['input.txt', 'expected.txt', 'actual.txt'] });
  // Checker exitCode 0/1/2 => AC/WA/PE (adapter status 0 OK, nonzero RE).
  // Student run never receives checker files or expected answer.
  // or const session = await program.startSession(limits, signal, { lifetimeMs: 300000 });
  // await session.sendLine(JSON.stringify(turn));
  // const response = await session.readLine(1000);
  // await session.close(); // always close in finally
} finally { program.dispose(); }
```

Languages: `python`, `javascript`, `typescript`, `c`, `cpp` (C++17), `cpp11`, `cpp14`. C++ uses `-O2 -DONLINE_JUDGE`. `prepare` validates/compiles without test input and holds a bounded artifact (max 4 MiB) in trusted worker memory; source size max **256 KiB UTF-8** (oversize rejects, never truncates). Source goes only through container stdin into private `/tmp`, not argv/environment; artifact is copied **from container stdout into a Buffer**, never unpacked from a tar or symlink on the host. Each `run` starts a fresh container. Internal-only optional run context has at most 16 files (total UTF-8 contents at most 1 MiB), safe ASCII basenames 1–128 characters (no directory, `..`, or reserved `program`), and at most 16 args (4 KiB each, 16 KiB total, no NUL). Validated context is framed over container stdin into the same private tmpfs; only the fixed runtime command receives the args array. No submitted student program should receive a checker context. A `startSession` gets one dedicated persistent container with line-delimited stdin/stdout; `sendLine` is async/backpressure-aware, `readLine` is sequential (no concurrent reads), and `close` is idempotent. `dispose` discards the compile artifact, not already-running sessions.

`run` returns `OK`, `RE`, `TLE`, `MLE`, `OLE`, `SE` or `CANCELLED` with stdout/stderr, exitCode and host `wallMs` (end-to-end worker wall clock, including Docker create/attach, artifact transfer and teardown; **not** CPU time). Optional `executionMs` is host elapsed time between READY and observed process exit (not CPU time, and undefined if READY/exit was not observed). Optional `memoryKb` is the **maximum observed** Docker daemon-reported, cache-adjusted *container* memory usage (rounded to KiB), not process RSS, not a precise/high-water cgroup peak and not an enforcement oracle. A host-side `docker stats --no-stream --no-trunc` request targets the full ID returned by `docker create`, accepts only matching full ID and name, and starts after READY; requests do not overlap, repeat no more than once per second after completion, time out at 3 seconds, and stop at exit/cancellation. There is no monitor process inside the sandbox. Short runs, failed/late samples and unsupported/malformed stats leave `memoryKb` undefined rather than reporting zero. Optional `cpuTimeMs` remains undefined: Docker CLI percentage is not cumulative CPU time; neither wall clock nor `executionMs` is substituted for CPU usage. The `timeLimitMs` host deadline starts on a fixed bootstrap-ready signal emitted after artifact/context transfer to private tmpfs and immediately before exec of the user program; it excludes image validation, compilation, container creation and transfer but includes runtime interpreter startup/scheduling overhead. Docker management has separate 10-second CLI operation and 25-second setup deadlines; this is not a precise process CPU meter. The real check ran a short Python program with an 80 ms run budget while its end-to-end Docker wall time exceeded 80 ms. Compilation throws `SandboxError` (`CE` for compiler/syntax errors, `SE` for infrastructure/resource failure, `CANCELLED` for abort). Session operations throw typed `SandboxError` (`RE` for early EOF, `TLE` for read/lifetime deadline, `OLE` for output cap, `CANCELLED` for abort). Session `timeLimitMs` does **not** govern total container lifetime: default lifetime is 300,000 ms (configurable per session from 1 to 300,000 ms); `readLine(timeoutMs)` is the individual round deadline. Session output cap counts **cumulative stdout + stderr**. The status can override a zero exit if an output chunk crossed the cap; on limits/abort the named container is immediately removed, not just the Docker CLI killed. A 137 exit alone is **not** called MLE. Language-level `MemoryError`/allocation failures can be RE rather than MLE.

Execution limits: 1–60,000 ms (one-shot), 32–1024 MiB, 1–1,048,576 output bytes; one-shot stdin max 1 MiB, compilation has its own 30-second/512-MiB/4-MiB-output budget; at most four simultaneous compile/run containers per worker process. Each container uses network `none`, all capabilities dropped, no-new-privileges, non-root UID/GID 65534, read-only rootfs, no host mounts, private executable 32 MiB `/tmp` tmpfs (`nosuid,nodev`), IPC `none`, 0.5 CPU, 32 PIDs, no swap beyond memory, and no Docker log driver. Executable tmpfs is necessary for native code; it is a deliberate tradeoff. The container image retains its own fixed PATH/Node environment, **not** backend business variables.

## Verification and deployment boundary

On macOS Docker Desktop (Linux arm64, Engine 29.2.1), the standalone real-Docker check ran Python/C++/JavaScript/TypeScript enum, JSONL exchange, compiler and runtime failures, host deadlines and output caps, cancellation, a cgroup-confirmed Python allocation OOM (`MLE`), blocked network and missing host/socket paths; it inspected an actual running container's HostConfig and checked there were no remaining `leverage-judge-` containers. In a local run after observation was added, a Python 12 MiB allocation held for 2 seconds returned **15,616 KiB sampled memory**, **2,208 ms** end-to-end wall time and the untrusted `memoryKb=999999` stdout unchanged; four short language cases took **162–171 ms** end-to-end versus **157–187 ms** in one pre-observation run. This is a limited local overhead sanity check, not a statistically controlled benchmark or a guarantee of observing short runs. `cpuTimeMs` was absent rather than inferred from wall time. This is not a security sign-off for hostile multi-tenant code: deployment still needs host kernel/LSM/seccomp/user-namespace policy review, supply-chain pinning, cgroup and fork-bomb/OOM load trials, daemon access separation and worker-wide distributed concurrency control. Local in-process concurrency is **not** a global cluster limit. Containers lost to an abrupt worker crash can require an external janitor for the `leverage-judge-` prefix; normal completion/cancellation cleans them. Do not expose this through an unauthenticated API.
