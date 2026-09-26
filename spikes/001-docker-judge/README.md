# 001 — ordinary Docker as an internal judge execution primitive

## Verdict: PARTIAL (feasible primitive, not a sandbox sign-off)

On this macOS Docker Desktop (Linux arm64, Engine 29.2.1), an ordinary **non-privileged** container executed fixed trusted Python, C++, Node JS, and erasable TypeScript examples without mounts, host networking, a Docker socket, or application environment variables. One-shot stdin/stdout and a persistent line-delimited JSON exchange both worked. Host-side timeout and combined stdout/stderr capture limit were exercised; named containers were absent afterward. This establishes a small execution primitive for an **internal worker in the same backend repository**, not a new public judge service and not proof that arbitrary adversarial code is safely contained.

## Reproduce

From the repository root, with Docker Desktop running:

```sh
python3 spikes/001-docker-judge/probe.py
# Optional Node/erasable TS coverage, after explicitly pulling this ~58.2 MiB compressed arm64 image:
docker pull node:22-alpine
python3 spikes/001-docker-judge/probe.py --node-image node:22-alpine
# Verify absence of test containers:
docker ps -a --filter name=spike-judge- --format '{{.Names}} {{.Status}}'
```

The first command requires local `python:3.11-alpine` and `golang:1.26.5-bookworm` images; it **does not auto-pull** missing images. `evidence.json` is the captured successful optional-Node run. Only the fixed, reviewed programs in `probe.py` are executed. No host paths/socket are mounted, no background worker/server is created. The compiler input is passed as base64 literal and decoded inside the container onto a private tmpfs; it does not ingest repository files. Node 22's built-in `--experimental-strip-types` only accepts erasable TypeScript syntax, **not** arbitrary TS requiring `tsc`, dependencies, path aliases or transpilation.

## Observed evidence (single local run; not a benchmark)

| Probe | Observation |
| --- | --- |
| Python one-shot | 189.0 / 167.1 / 177.0 ms end-to-end for a JSON sum, including Docker CLI/container startup |
| Persistent JSONL | first request 107.9 ms including startup; second request 1.3 ms in the same container; two responses; total 1280 ms **includes a blocking `docker stats --no-stream` and inspect between rounds** |
| Python memory | process `resource.getrusage(...).ru_maxrss` 12108 KiB **in a separate short-lived process**; idle interactive container `docker stats` 5.953 MiB / 128 MiB and 1 PIDs. These are different scopes and sampling times; do not equate or subtract them. |
| HostConfig inspect | network `none`, cap-drop `ALL`, no-new-privileges, 128 MiB memory/swap, 0.5 CPU, 64 PIDs, read-only rootfs, only `/tmp` tmpfs, null binds, IPC `none` |
| Egress | connect to `1.1.1.1:53` failed with `[Errno 101] Network unreachable` |
| Timeout | infinite loop killed on 1 s host deadline, exit 137, container removed; observed end-to-end 1154.7 ms |
| Output limit | 50,000-byte output was classified `output_limit` at combined 2,048-byte capture cap and container absent afterward; program finished quickly (exit 0), so exit code alone is not the result |
| C++ | fixed source compiled with local `/usr/bin/g++`, then ran from private executable tmpfs: `5\n`, 282.0 ms including compiler and startup |
| Node / erasable TS | JSON sum `5` in 146.5 / 171.7 ms respectively (Node 22 Alpine arm64) |
| Cleanup | `docker ps -a --filter name=spike-judge-` printed no containers at end |

The host had ~26 GiB available on the system volume and ~460 GiB on `/Volumes/M.2` before pulling Node. Arm64 registry layers totalled ~58.2 MiB compressed; local image inspect reported 61,068,044 bytes after pull. No raw downloads or temp files were created on the host by this spike; the newly pulled Node image was removed after capture (`docker image rm node:22-alpine`). The pre-existing large Go image contains g++; a lean dedicated C++ image would need separate size, toolchain, and security validation. The `/tmp` tmpfs needs `exec` for compiled binaries: an initial `noexec` run compiled but failed to launch with `Permission denied`. It is `nosuid,nodev` and private, but `exec` is itself a security tradeoff.

## Boundaries and production recommendation

- Keep execution behind the existing backend's internal worker queue; default `all` can host API + worker, with independently launchable `api` / `worker` roles. Do not add an externally accessible judge API or global master election.
- Minimal internal call shape: `execute({language, sourceArtifact, stdinBytes, timeLimitMs, memoryBytes, outputLimitBytes, mode: 'oneshot' | 'jsonl'}) -> {status: OK | COMPILE_ERROR | RUNTIME_ERROR | TIME_LIMIT | MEMORY_LIMIT | OUTPUT_LIMIT | INFRA_ERROR, exitCode, stdoutBytes, stderrBytes, wallMs, containerPeakBytes?, processPeakKiB?}`. Keep compile and run budgets/results separate; pin immutable runtime image digests and validate language/source/input/size bounds before spawning. For interactive mode expose a bounded session with `sendLine`, `recvLine(deadline)`, `close`; own one process/container per match as required, or restart per turn for programs designed to exit each turn. Do not silently conflate these lifecycles.
- Apply host-side deadlines and aggregate stream caps **while draining pipes**; always remove the named container on timeout/output limit/cancellation and reap Docker CLI, even on exceptions. Classify policy status before exit code (the output cap can race a normal exit). Limit overall concurrent containers and compilation tempfs/CPU as well as per-container memory/PIDs.
- This is **not** complete adversarial isolation: Docker daemon access must stay only with trusted worker code; no host binds or socket, privileged mode, host network, business secrets, or inherited environment. Review seccomp/AppArmor/LSM support on the actual deployment host, user namespace/rootless strategy, kernel risk, filesystem and process accounting, image supply chain, and multi-tenant abuse before accepting unknown submissions. Docker Desktop observations do not establish Linux production behavior. `docker stats` is a container-level sampled value; language `ru_maxrss` measures process RSS, and neither is a validated peak contest accounting metric here.
- Source delivery in this disposable probe uses command arguments, which can be visible in process listings and hit OS argv limits; production needs a bounded private non-host-mounted input transport (for example a controlled stdin protocol plus tmpfs staging), not arbitrary command strings. Full TS toolchain/bot SDK, judge orchestration, repeated concurrent load, fork bombs, OOM classification and correctness against existing upstream judges remain untested.
