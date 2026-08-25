# 05 — API Specification

**Status:** Draft v1
**Depends on:** [03-system-architecture.md](./03-system-architecture.md), [04-database.md](./04-database.md)
**Feeds into:** [roadmap/](../roadmap/)

## 0. Conventions

- Base URL: `https://api.cricketai.app/api/v1` (Coordinator API — see [03-system-architecture.md](./03-system-architecture.md) §3b). Staging equivalent at a separate host per environment.
- Auth: `Authorization: Bearer <supabase_jwt>` on every endpoint below unless stated otherwise. The Coordinator API verifies the token against Supabase's JWKS; it does not re-implement auth.
- All request/response bodies are JSON.
- Errors follow a single shape:
  ```json
  { "error": { "code": "VIDEO_NOT_SUITABLE", "message": "Human-readable explanation", "details": {} } }
  ```
- Standard HTTP status codes: `400` validation, `401` unauthenticated, `403` unauthorised (not yours), `404` not found, `409` conflict (e.g. duplicate follow-up), `422` semantically invalid (e.g. video rejected), `500` server error.
- Pagination (history endpoint): cursor-based, `?cursor=<opaque>&limit=<n, default 20, max 50>`.

## 1. Operations handled directly via Supabase client (not Coordinator API)

Documented here for completeness — these do not have Coordinator API endpoints because Postgres RLS ([04-database.md](./04-database.md) §5) is sufficient authorisation and no server-side orchestration is needed:

| Operation | Table | Notes |
|---|---|---|
| Read/update own profile | `profiles` | SR-PROF-001 |
| Read drill catalogue | `drills`, `drill_root_causes` | public read to authenticated users |
| Mark drill complete | `drill_completions` (insert) | SR-DRILL-002; RLS restricts insert to prescriptions belonging to the caller |
| Sign in / sign up / OAuth / session refresh | `auth.*` (Supabase Auth) | SR-AUTH-001/002/003 |

## 2. Coordinator API Endpoints

### `POST /videos`
Create a video submission and receive a signed upload URL.

- **Auth:** required.
- **Permissions:** any authenticated player, for their own submission.
- **Request:**
  ```json
  { "kind": "initial" | "followup", "linkedIssueId": "uuid | null" }
  ```
- **Validation:** `kind = followup` requires `linkedIssueId`; the referenced issue must belong to the caller and must not already have a pending/complete follow-up in progress (SR-PROG-001; `409 DUPLICATE_FOLLOWUP` otherwise).
- **Response `201`:**
  ```json
  {
    "videoId": "uuid",
    "uploadUrl": "https://...signed...",
    "uploadExpiresAt": "2026-08-25T10:15:00Z"
  }
  ```
- **Errors:** `400 INVALID_KIND`, `403 ISSUE_NOT_OWNED`, `404 ISSUE_NOT_FOUND`, `409 DUPLICATE_FOLLOWUP`.

### `POST /videos/:videoId/confirm-upload`
Client calls this once the file upload to the signed URL succeeds. Triggers the validation → analysis pipeline (§7 of [03-system-architecture.md](./03-system-architecture.md)).

- **Auth:** required. **Permissions:** caller must own `videoId`.
- **Request:** `{ "durationSeconds": number }`
- **Validation:** the object must actually exist at the expected storage path (server-side check against Storage, not trusted from the client) and be a supported format/size (SR-VID-002).
- **Response `202`:** `{ "videoId": "uuid", "status": "validating" }`
- **Errors:** `404 VIDEO_NOT_FOUND`, `409 ALREADY_SUBMITTED`, `422 UPLOAD_NOT_FOUND` (nothing at the expected storage path).

### `GET /videos/:videoId`
Poll processing status (fallback to Supabase Realtime subscription — SR-VID-005).

- **Auth:** required. **Permissions:** owner only.
- **Response `200`:**
  ```json
  {
    "videoId": "uuid",
    "kind": "initial",
    "status": "analysing",
    "rejectionReason": null,
    "createdAt": "2026-08-25T10:00:00Z"
  }
  ```
- **Errors:** `403 NOT_OWNER`, `404 VIDEO_NOT_FOUND`.

### `GET /videos/:videoId/analysis`
Full analysis result for a `complete` video (SR-CV-004, SR-COACH-004).

- **Auth:** required. **Permissions:** owner only.
- **Response `200`:**
  ```json
  {
    "videoId": "uuid",
    "measurements": [
      { "markerKey": "head_stability", "value": 7.2, "unit": "degrees", "confidence": 0.86 }
    ],
    "issues": [
      {
        "issueId": "uuid",
        "rootCause": "head_falling_away",
        "severity": 0.71,
        "confidence": 0.86,
        "isPrimary": true,
        "explanation": {
          "observation": "Your head moves noticeably away from the ball between backlift and contact.",
          "measurement": "Head lateral drift measured at 7.2° vs a stable-technique reference range of 0–4°.",
          "interpretation": "This usually costs balance and bat control through the shot.",
          "recommendation": "The prescribed drill targets keeping your head still through the shot.",
          "confidenceLabel": "high"
        }
      }
    ],
    "prescribedDrill": { "drillId": "uuid", "title": "Wall Head-Still Drill" }
  }
  ```
- **Errors:** `403 NOT_OWNER`, `404 VIDEO_NOT_FOUND`, `422 ANALYSIS_NOT_READY` (video exists but isn't `complete` yet — client should poll `GET /videos/:videoId` instead).

### `GET /videos/:videoId/comparison`
Progress comparison result for a `followup` video (SR-PROG-002).

- **Auth:** required. **Permissions:** owner only.
- **Response `200`:**
  ```json
  {
    "verdict": "improved",
    "originalValue": 7.2,
    "followupValue": 3.1,
    "deltaValue": -4.1,
    "confidence": 0.79,
    "formulaVersionMismatch": false,
    "summary": "Your head stability improved significantly since your last recording."
  }
  ```
- **Errors:** `400 NOT_A_FOLLOWUP` (called on an `initial`-kind video), `403 NOT_OWNER`, `404 VIDEO_NOT_FOUND`, `422 ANALYSIS_NOT_READY`.

### `POST /videos/:videoId/retry`
Retry a `failed` (not `rejected`) video through the pipeline (NFR-02).

- **Auth:** required. **Permissions:** owner only.
- **Validation:** only valid when `status = failed`; a `rejected` video must be re-recorded, not retried (`422 CANNOT_RETRY_REJECTED`).
- **Response `202`:** `{ "videoId": "uuid", "status": "validating" }`
- **Errors:** `403 NOT_OWNER`, `404 VIDEO_NOT_FOUND`, `422 CANNOT_RETRY_REJECTED`, `422 NOT_FAILED`.

### `GET /players/me/history`
Session history (SR-HIST-001).

- **Auth:** required.
- **Query:** `?cursor=&limit=`
- **Response `200`:**
  ```json
  {
    "sessions": [
      {
        "videoId": "uuid",
        "kind": "initial",
        "status": "complete",
        "createdAt": "2026-08-01T09:00:00Z",
        "primaryIssueRootCause": "head_falling_away",
        "drillTitle": "Wall Head-Still Drill",
        "drillCompletedAt": "2026-08-03T18:20:00Z",
        "followupVerdict": "improved"
      }
    ],
    "nextCursor": "opaque-string | null"
  }
  ```

### `DELETE /players/me`
Full account and data deletion (SR-DATA-001). Not delegated to RLS because it must also purge Storage objects and the `auth.users` record via the service role — a client-side RLS-scoped delete cannot do this atomically.

- **Auth:** required.
- **Request:** `{ "confirm": true }` — request is rejected without explicit confirmation (irreversible action).
- **Response `202`:** `{ "status": "deletion_scheduled" }` — deletion is processed asynchronously but is guaranteed to complete within the window committed to in [11-security.md](./11-security.md); the account is immediately unusable regardless of when the async purge finishes.
- **Errors:** `400 CONFIRMATION_REQUIRED`.

## 3. Rate Limiting

Applied at the Coordinator API layer (see [11-security.md](./11-security.md) §7):
- `POST /videos`: 10 requests / hour / player — bounds processing cost (NFR-08) and abuse.
- `POST /videos/:videoId/retry`: 5 requests / hour / player.
- All other endpoints: 120 requests / minute / player (generous, covers normal polling).
