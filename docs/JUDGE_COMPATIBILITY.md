# Judge compatibility and execution boundaries

> Historical adapter research only. The external Botzone judge connector, callbacks
> and Heng integration have been removed. The internal Nest worker is the active
> judge path; see `JUDGE_SANDBOX.md` for its execution boundary.

## Historical external Botzone adapter

The adapter was checked against `bkmashiro/botzone-neo` revision
`164717ef8cc5de4313d430058047b9140bbeb1e0`. This identifies the inspected source,
not an assertion that a deployment runs that revision.

- Submit: `POST /v1/judge`, with inline `source` and testcases for OJ tasks.
- Poll: `GET /v1/judge/:jobId/status`. Bull states such as `waiting`, `active`,
  `completed` and `failed` are supported; legacy envelope states remain readable.
- OJ callbacks may contain the result directly (`verdict`, `testcases`, `compile`)
  rather than an envelope. Raw callbacks require the submission ID, current
  attempt and a scoped HMAC query token. Invalid credentials do not become
  anonymous callbacks. A valid older envelope still uses the existing path.
- Upstream verdicts include `AC`, `WA`, `CE`, and other short names. Existing long
  verdict names are accepted; unknown verdicts are not reported as AC.
- Upstream fields carry explicit units: `timeLimitMs` / `timeMs`,
  `memoryLimitMb`, and result `memoryKb`.

The inspected compiler registry supports `cpp` (C++17), `python`, `javascript`
and `typescript`. String aliases `cpp17` and `python3` are normalized at the
adapter boundary. Do not infer Java, Go or C support from a language selector.

For ordinary OJ submissions, existing numeric IDs are preserved. The Botzone
adapter accepts only `3` (C++17), `9` (Python3), `10` (JavaScript), and `11`
(TypeScript). It does not silently compile C++11/14 submissions as C++17.
Unsupported new submissions and rejudges are rejected before discarding an
existing result. This does not remove Heng's separate language support.

## Runtime status

Transport, DTO, mock-provider, database and browser checks are separate from a
real compiler/sandbox run. The inspected upstream's custom judge uses an ordinary
subprocess, while its Bot path uses nsjail. Its deployment requirements and that
boundary have not been accepted as safe production execution here.

The approved target is one backend application with `all`, `api`, and `worker`
roles and an internal isolated executor. That transition is tracked in
`MEGAGOAL.md`; these role names are not a claim that the runtime is already
implemented. No additional public judge service, global backend leader election,
or automatic production deployment is part of the target.

## Read and logging boundaries

Public Bot detail retains metadata and open-source code. Private source and
webhook secrets require the owner; an invalid supplied credential fails rather
than falling back to anonymous access. Lists and nested match participants do not
include source or secrets. Owner version creation retains omitted private fields.

HTTP request logs omit query strings used for SSE/callback capabilities. Explicit
audit payloads redact credential-named fields without changing the request body.
This is not a claim that arbitrary submitted program text contains no secrets.

See `HARDENING.md` for deployment ordering and the additive migration boundary.
