# API Reference

Interactive documentation is available at `/api/docs` (Swagger UI) when the server is running. This document provides a structured overview of all routes, auth requirements, and conventions.

## Authentication

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

Obtain tokens via `POST /auth/login`. Refresh via `POST /auth/refresh`.

## Response Format

```jsonc
// Success
{ "data": { ... } }        // or top-level object/array depending on endpoint

// Error (NestJS default exception format)
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

## Permission Levels

Permissions are hierarchical. A higher role also satisfies lower-privilege requirements.

| Role | Weight | Description |
|------|--------|-------------|
| `sa` | 0 | Super admin — full access |
| `admin` | 1 | Admin — manage users, problems, contests |
| `supervisor` | 2 | Can view sensitive data (submissions, balloons) |
| `user` | 3 | Authenticated regular user |
| `contest-user` | 4 | Contest-scoped user |
| `guest` | 5 | Unauthenticated |

The column **Auth** in the tables below uses:
- `—` → public (no token required)
- `user` → any authenticated user
- `supervisor` → supervisor or above
- `admin` → admin or above
- `sa` → super admin only

---

## Routes

### Auth — `/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | — | Login with username/password; returns `accessToken` + `refreshToken` |
| POST | `/auth/login/contest` | — | Login as a contest user; returns scoped `accessToken` |
| POST | `/auth/refresh` | — | Exchange `refreshToken` for a new `accessToken` |
| POST | `/auth/logout` | — | Stateless logout (client discards token) |
| GET | `/auth/profile` | user | Return current user's JWT payload |

### Users — `/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users` | supervisor | Paginated user list with search |
| POST | `/users` | admin | Create a user |
| POST | `/users/import` | admin | Bulk import users |
| GET | `/users/:id` | user | User profile |
| PATCH | `/users/:id` | admin | Update user (role weight check enforced) |
| DELETE | `/users/:id` | admin | Delete user |
| POST | `/users/:id/password` | user | Change password (self or admin+) |
| GET | `/users/:id/problem-status` | user | Per-problem AC/attempt status (from Redis) |

### Problems — `/problems`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/problems` | — | Paginated problem list; non-admin filters out hidden problems |
| GET | `/problems/:id` | — | Problem detail (6 s Redis cache) |
| POST | `/problems` | admin | Create problem |
| PATCH | `/problems/:id` | admin | Update problem |
| DELETE | `/problems/:id` | admin | Delete problem |
| POST | `/problems/:id/test-data` | admin | Upload test data `.zip` |

### Submissions — `/submissions`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/submissions` | — | Paginated list; filter by `userId`, `problemId`, `status` |
| GET | `/submissions/:id` | — | Submission detail with judge result |
| POST | `/submissions` | user | Create submission (rate-limited per user) |
| GET | `/submissions/:id/status` | — | Fast status poll (from Redis) |
| POST | `/submissions/:id/rejudge` | supervisor | Re-enqueue submission for judging |

### Contests — `/contests`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/contests` | user | Paginated list; filter by status |
| POST | `/contests` | admin | Create contest |
| GET | `/contests/:id` | user | Contest detail with problem list |
| PATCH | `/contests/:id` | admin | Update contest |
| DELETE | `/contests/:id` | admin | Delete contest |
| POST | `/contests/:id/users` | user | Register self to contest |
| POST | `/contests/:id/users/import` | admin | Bulk import contest users (random passwords) |
| GET | `/contests/:id/ranking` | user | Real-time ranking (Redis Sorted Set) |
| GET | `/contests/:id/balloons` | supervisor | List undelivered balloon records |
| PATCH | `/contests/:id/balloons/:bid` | supervisor | Mark balloon as delivered |
| POST | `/contests/:id/submissions` | user | Submit code within contest context |
| GET | `/contests/:id/submissions` | user | List contest submissions |

### Courses — `/courses`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/courses` | user | Paginated course list |
| POST | `/courses` | admin | Create course |
| GET | `/courses/:id` | user | Course detail |
| PATCH | `/courses/:id` | admin | Update course |
| DELETE | `/courses/:id` | admin | Delete course |
| POST | `/courses/:id/students` | admin | Add students to course |
| DELETE | `/courses/:id/students/:userId` | admin | Remove student from course |
| GET | `/courses/:id/ranking` | user | Course leaderboard |
| GET | `/courses/:id/submissions` | user | Course submission list |
| GET | `/courses/:id/submissions/export` | user | Export submissions (exact / range / regex filter) |
| POST | `/courses/:id/submissions` | user | Submit code within course context |

### Compete (Bot Battle) — `/compete`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/compete/games` | — | List all games |
| GET | `/compete/games/:id/leaderboard` | — | Game win-rate leaderboard |
| POST | `/compete/games` | admin | Create game |
| PATCH | `/compete/games/:id` | admin | Update game |
| DELETE | `/compete/games/:id` | admin | Delete game |
| POST | `/compete/games/:id/playback` | admin | Upload game playback zip |
| GET | `/compete/gamers` | — | List all bot players |
| POST | `/compete/gamers` | user | Register a bot |
| PATCH | `/compete/gamers/:id` | user | Update own bot |
| POST | `/compete/matches` | user | Create a match |
| GET | `/compete/matches` | — | List matches |
| GET | `/compete/matches/:id` | — | Match detail |

### Media — `/media`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/media/upload` | user | Upload file (extension + MIME validation) |
| GET | `/media` | admin | List uploaded files |
| GET | `/media/:id` | — | Get file download URL |
| DELETE | `/media/:id` | admin | Delete file |

### Heng (Judge Callbacks) — `/heng`

> These endpoints are called by `heng-controller`, not by frontend clients.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/heng/update/:submissionId/:judgeId` | — | Intermediate judge state callback |
| POST | `/heng/finish/:submissionId/:judgeId` | — | Final judge result callback |

### Health & Observability

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Service health (DB + Redis) |
| GET | `/metrics` | — | Prometheus metrics |

---

## Common Error Codes

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Bad Request — validation failed |
| 401 | Unauthorized — missing or invalid token |
| 403 | Forbidden — insufficient role |
| 404 | Not Found — resource does not exist |
| 409 | Conflict — duplicate resource (e.g. username taken) |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error |

For full request/response schemas, refer to the Swagger UI at `/api/docs`.
