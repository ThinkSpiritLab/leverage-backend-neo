# Leverage product-quality megagoal

## Goal

Make Leverage a coherent, reliable and maintainable OJ/Botzone product. Prioritize
Botzone's player, Bot-author and game-author journeys while improving the shared
frontend shell and protecting OJ, course, contest and administration behavior.
A user should be able to discover a game, create a Bot, edit/test it, enter a match
and understand the replay without losing work or reconstructing the workflow.
A developer should be able to add a game using documented judge/renderer contracts
and a working example rather than reverse-engineering several pages.

## Scope and ownership

This is the single roadmap for both `ThinkSpiritLab/leverage-backend-neo` and
`ThinkSpiritLab/leverage-frontend-neo`, normally sibling clones under `~/projects`.
Read both root `agent.md` files. Start from the current
`fix/architecture-hardening` branches; inspect actual status/remotes before work.
Keep one current execution pointer here, not separate competing frontend plans.
Preparation does not activate execution; start when the user sends `/goal`.

## Current baseline

- Both branches contain signed, pushed fixes for account authorization, human-turn
  ownership, transactional judge settlement, rejudge attempts, ELO locking, missing
  migrations, refresh recursion, iframe sources, SSE routing and polling recovery.
  Neither branch has been merged into main or deployed. Do not redo these fixes.
- Both production builds and backend TypeScript checking passed. Backend unit
  baseline: 32 suites / 766 tests passed. Real MariaDB migration, callback race,
  rejudge and rollback checks passed. See `docs/HARDENING.md`.
- The combined backend E2E command had 69 passing tests, five failures due to the
  missing native SQLite module, and six existing skipped tests. Full lint was not
  green. Frontend regression probes passed; they are not real Botzone browser E2E.
- Read-only UI review found a clipped mobile workspace, duplicate/unclear entry
  actions, fragmented editing/testing/replay, and missing code draft protection.
- Verified contract defect: game-author language options emit OJ numeric IDs
  (`9`), whereas the Botzone DTO requires a runtime string (`python`). The real
  Nest validation pipeline rejected the numeric fixture and accepted the string.
- Corrected hypothesis: Game/Gamer `name` is an entity-generated alias of `title`.
  Initial blank-title mock screenshots were a fixture error, not a product defect.
- Current game extension uses stored judge code and sandboxed `rendererHtml` with
  generic routes. Preserve this useful boundary. Human-turn/SSE state remains
  process-local; do not advertise multi-instance support.

## Ordered outcomes

### 1. Trustworthy authoring and API contracts

Fix the language mismatch across game administration and Playground. Type the
critical Game/Gamer/Match requests and responses, keeping OJ numeric language IDs
separate from Botzone runtime identifiers. Add focused request/DTO regressions.
Protect code drafts by user/game/context, show saved/dirty state and warn before
losing edits. Ensure logout/account switching cannot expose another user's draft.

Done when creation/editing/testing payloads pass real backend validation and draft
recovery, isolation and navigation behavior have executable coverage.

### 2. Coherent shared UI and responsive navigation

Keep Naive UI. Establish a small shared set of spacing, typography, surface and
action styles; improve navigation, loading/error/empty states, focus and keyboard
behavior. Collapse navigation appropriately on phones. Make game discovery,
participation, result reading and replay usable on narrow screens. Prioritize a
clean developer workspace over decorative dashboard styling; do not force a
multi-pane coding layout onto phones.

Start with the shared shell, Botzone lobby and game detail. Remove duplicate
navigation and align button labels with destinations. Use real game previews where
available rather than invented screenshots. Avoid redesigning unrelated pages
without a shared defect or clear user benefit.

Done when desktop and mobile browser checks show accessible actions, readable
content and no clipped essential controls on representative populated/empty/error
states. Record real screenshots, distinguishing fixtures from live backend data.

### 3. Connected Bot development and match workflow

Make game selection, Bot creation/editing, testing, match entry and replay a
connected journey that retains game/Bot/draft context. Distinguish save, test and
participation actions. Keep human participation and external Bot paths coherent.
Separate advanced judge/renderer creation from the default player's workflow;
keep tutorials discoverable without displacing returning users' tools.

Done when a first-time user and a returning Bot author can complete the journey
without manually copying context between pages, and failure/retry/cancellation
states are understandable. Exercise human-turn ownership and replay interactions.

### 4. Maintainable game-extension boundary

Centralize log normalization in one typed pure function, preserve necessary raw
fields, and share a small representative fixture across preview, Playground and
replay. Document the actual sandbox/postMessage contract and correct conflicting
examples. Provide one runnable minimal game/judge/renderer example and explain
where a second game differs. Extract a few coherent components/composables from
large pages where ownership is genuinely distinct; file length alone is not a
reason to split.

Done when the example follows the documented path without changing frontend
routing or introducing a plugin registry, and a focused real iframe-message
browser test exercises the supported protocol and rejects unrelated sources.

### 5. Integrated quality and handoff

Run the actual frontend/backend flows against disposable, representative data.
Add targeted browser coverage for Botzone, beyond source-string assertions. Fix
encountered correctness/security/reliability defects and regressions relevant to
these flows. Recover the existing SQLite E2E environment where proportionate;
distinguish environment problems, pre-existing failures and new defects. Keep
changed code lint-clean without imposing an unrelated repository-wide restyle.
Inspect navigation/loading responsiveness and bundle/runtime costs; optimize only
observed bottlenecks with before/after evidence.

Verify migrations on fresh and upgrade databases, normal/contest/auth-negative
paths, and smoke-test OJ submissions, courses, contests and administration. A real
judge end-to-end run requires an available authorized judge service; mocked UI or
judge responses must not be presented as proof that the external sandbox works.
If that dependency is unavailable, finish independent work and report the remaining
acceptance gate as blocked rather than marking the entire goal complete.

Keep `agent.md`, development instructions, configuration examples and deployment
notes aligned. Deliver signed commits and pushed branches with honest test state.
Do not silently merge or deploy.

## Constraints and non-goals

- Prefer small coherent changes, few dependencies and clear ownership. Preserve
  Nuxt/Vue/Naive UI, NestJS and the modular monolith unless the user approves a
  materially different design. No microservice split, generic plugin platform,
  event-sourcing framework or speculative feature expansion.
- Preserve existing routes, saved programs, judge protocols, OJ status semantics,
  roles and renderer sandbox isolation. Discuss unavoidable public-contract,
  product/scoring or architecture changes before committing to them.
- Do not change production data, deploy, merge main, buy services, expose secrets,
  or weaken tests/sandbox/authorization to reach a green result. Do not silently
  recalculate historical rankings. Rehearse additive migrations and state their
  rollback boundary honestly.
- Temporary isolated MariaDB/Redis and local-judge Docker test containers are
  authorized for this goal; clean them afterward. No production access or paid
  infrastructure is authorized. Check before adding other external services.
  Prefer local verification and do not manually trigger expensive CI without need.
- Large downloads and temporary test data may use the mounted external disk
  `/Volumes/M.2`, after checking availability. Do not move global Docker storage
  or shared package caches without separate approval. Clean task-owned resources.
- Use mock fixtures for isolated UI work, but validate their shape against actual
  DTOs/entities. Label mock, real database, browser and real judge evidence.
- No cron, watchdog or unattended deployment setup is needed for this goal.

## Approved execution architecture

The user approved one backend application with `all` (default), `api` and
`worker` roles. Keep one business API, data model and queue lifecycle; do not add
another public judge backend or a global primary/replica framework. Workers claim
jobs through the existing Bull queue. Only singleton maintenance/scheduling needs
a bounded Redis lease, with idempotent database writes rather than a promise of
exactly-once execution.

Untrusted code must remain outside the NestJS process. First verify ordinary,
non-privileged Docker isolation using trusted small programs. Task containers
must have no network, no host bind mounts or Docker socket, no business secrets,
read-only root filesystems, and explicit CPU/memory/PID/output/time bounds. The
trusted backend worker may orchestrate them. Do not run the unsafe candidate
upstream deployment merely to obtain a passing real-judge result.

Integrate execution into this repository after that feasibility gate. Preserve
existing API routes and keep external adapters as explicit migration options
until internal execution is verified. A worker-mode process must not listen on
an HTTP port. Do not deploy or merge main as part of this work.

## Execution pointer

Current: checkpointing the verified UI/DX/security changes, then implementing
the approved unified-backend roles and internal executor. Existing verification:
backend TypeScript check and 828 unit tests; SQLite 42 passed with three existing
skips; ordinary container HTTP suites passed; five additional real-MariaDB Bot
privacy/owner-versioning cases passed. Frontend production build, 27 browser
fixture tests, source probes, trusted example programs and real iframe messaging
passed. Desktop/mobile views were inspected; none of these is a real judge run.

Next: use the isolated Docker feasibility result to implement execution; add
`all`/`api`/`worker` entry behavior and singleton-maintenance coordination without
a global primary backend. Preserve the current API and migration options.

Blocked: no role/UI implementation blocker. Real compilation/match acceptance
remains open until the internal executor is exercised under actual isolation.
Do not substitute the unsafe candidate upstream or silently request privileged
execution. The focused spike lives under `spikes/001-docker-judge/`.

After each coherent verified slice, replace this pointer and update the applicable
outcome with concise durable evidence. Continue through independent unblocked
work; a milestone or subagent completion alone is not a stopping condition.
Stop at completed acceptance or a material product/permission/safety/resource/tool
blocker. Do not turn this document into a chronological command log.
