# 02 — Software Requirements

**Status:** Draft v1
**Depends on:** [01-product-requirements.md](./01-product-requirements.md)
**Feeds into:** [03-system-architecture.md](./03-system-architecture.md), [04-database.md](./04-database.md), [05-api.md](./05-api.md), [roadmap/](../roadmap/)

Each requirement has a stable ID (`SR-<CATEGORY>-<NNN>`), maps to one or more product requirements ([01](./01-product-requirements.md)), and carries explicit acceptance criteria. IDs are permanent once assigned — never renumber; deprecate instead.

Categories: `AUTH`, `PROF` (profile), `VID` (video capture/ingestion), `CV` (computer vision pipeline), `COACH` (coaching engine), `DRILL`, `PROG` (progress/re-measurement), `HIST` (history), `DATA` (data lifecycle).

---

## AUTH — Authentication & Accounts

### SR-AUTH-001 — Account creation
**Description:** A user can create an account via email + password.
**Priority:** Must
**Maps to:** FR-01
**Dependencies:** None
**Acceptance criteria:**
- Email must be verified before the player can submit a video for analysis (verification not required to browse onboarding).
- Password meets minimum strength rules enforced server-side, not just client-side.
- Duplicate email registration returns a clear, non-enumerating error (does not confirm/deny existing accounts to unauthenticated callers).

### SR-AUTH-002 — OAuth sign-in
**Description:** A user can sign in via at least one OAuth provider (Apple Sign-In required for iOS App Store compliance if any other social login is offered; Google as the second option).
**Priority:** Must
**Maps to:** FR-01
**Dependencies:** SR-AUTH-001
**Acceptance criteria:**
- Apple Sign-In is available if Google Sign-In is available (App Store requirement).
- OAuth account and email/password account with the same verified email are treated as the same identity, not silently merged without user confirmation.

### SR-AUTH-003 — Session management
**Description:** Authenticated sessions use short-lived access tokens with refresh tokens; sessions are revocable.
**Priority:** Must
**Maps to:** NFR-03
**Dependencies:** SR-AUTH-001
**Acceptance criteria:**
- Access token lifetime ≤ 1 hour.
- Revoking a session (e.g. on password change) invalidates outstanding refresh tokens.

### SR-AUTH-004 — Under-18 account handling
**Description:** Account creation captures age band; accounts identified as under 18 apply stricter default privacy settings (see [11-security.md](./11-security.md) §9).
**Priority:** Must
**Maps to:** NFR-03
**Dependencies:** SR-AUTH-001, SR-PROF-001
**Acceptance criteria:**
- Under-18 accounts default to private video visibility with no sharing features exposed.
- Age band cannot be silently changed to bypass these defaults without re-verification.

---

## PROF — Player Profile

### SR-PROF-001 — Minimal profile capture
**Description:** Capture display name, date of birth or age band, batting hand, playing level.
**Priority:** Must
**Maps to:** FR-02
**Dependencies:** SR-AUTH-001
**Acceptance criteria:**
- All four fields required before first video submission is allowed.
- Batting hand (left/right) is used downstream to correctly orient CV analysis (mirroring); an incorrect value is user-correctable at any time and triggers no retroactive reprocessing in v1 (flagged limitation, not silently wrong — see [07-computer-vision.md](./07-computer-vision.md) §3).

---

## VID — Video Capture & Ingestion

### SR-VID-001 — In-app recording with framing guidance
**Description:** In-app camera capture shows an on-screen guide overlay for correct side-on framing and distance.
**Priority:** Must
**Maps to:** FR-03
**Dependencies:** SR-PROF-001
**Acceptance criteria:**
- Overlay is shown before recording starts.
- Recorded video is capped at a maximum duration (target: 15 seconds) to bound processing cost.

### SR-VID-002 — Upload from device library
**Description:** Player can select an existing video file instead of recording live.
**Priority:** Should
**Maps to:** FR-04
**Dependencies:** SR-VID-001
**Acceptance criteria:**
- Accepts .mp4 and .mov.
- Rejects files above a defined size/duration ceiling with a clear error before upload begins (client-side pre-check), not only after server rejection.

### SR-VID-003 — Upload to storage
**Description:** Validated video files are uploaded directly to object storage via a signed URL, not proxied through the application server.
**Priority:** Must
**Maps to:** FR-03, FR-04
**Dependencies:** SR-VID-001
**Acceptance criteria:**
- Upload uses a short-lived signed URL scoped to one object.
- Upload failures are resumable/retryable without re-recording.

### SR-VID-004 — Pre-analysis suitability validation
**Description:** Before full CV analysis, an automated check assesses whether the video is analysable: duration, resolution, estimated camera angle, subject visibility/occlusion, lighting.
**Priority:** Must
**Maps to:** FR-05, US-14
**Dependencies:** SR-VID-003
**Acceptance criteria:**
- A video failing suitability is never passed to the full analysis pipeline.
- The rejection reason returned to the client is specific (e.g. "camera angle looks front-on, not side-on") and maps to a defined, finite set of reason codes — not a generic failure message.
- Suitability check completes fast enough to give feedback before the player walks away from their recording setup (target: < 20 seconds).

### SR-VID-005 — Processing status visibility
**Description:** The client can query/subscribe to the processing status of a submitted video at all times.
**Priority:** Must
**Maps to:** US-04
**Dependencies:** SR-VID-003
**Acceptance criteria:**
- Status is one of a finite enum: `uploaded`, `validating`, `rejected`, `analysing`, `complete`, `failed`.
- A `failed` state always carries a reason and a retry action; it never dead-ends silently.

---

## CV — Computer Vision / Analysis Pipeline

### SR-CV-001 — Frame extraction
**Description:** Extract frames from the validated video at a defined sample rate sufficient to capture the shot phases (stance, backlift, downswing, contact, follow-through).
**Priority:** Must
**Maps to:** FR-06
**Dependencies:** SR-VID-004
**Acceptance criteria:**
- Frame extraction identifies (at minimum, approximately) the contact-point frame using bat/body motion heuristics.
- Pipeline degrades gracefully (lower confidence, not crash) on dropped/blurred frames.

### SR-CV-002 — Pose estimation
**Description:** Run a pose-estimation model against extracted frames to produce body landmark coordinates per frame.
**Priority:** Must
**Maps to:** FR-06
**Dependencies:** SR-CV-001
**Acceptance criteria:**
- Landmark output includes, at minimum, head, shoulders, elbows, wrists, hips, knees, ankles.
- Per-landmark, per-frame confidence score is retained, not discarded — required for SR-COACH-004.

### SR-CV-003 — Technique measurement derivation
**Description:** Derive the fixed v1 measurement set (head stability, balance/weight transfer, backlift alignment, front elbow height, base width, follow-through shape) from landmark trajectories.
**Priority:** Must
**Maps to:** FR-06
**Dependencies:** SR-CV-002
**Acceptance criteria:**
- Each measurement is a defined, versioned formula over landmark data (see [07-computer-vision.md](./07-computer-vision.md) §6) — not an ad hoc/opaque model output.
- Each measurement carries a numeric confidence derived from underlying landmark confidence and frame coverage.
- Measurement formula version is stored with the result, so future formula changes don't silently invalidate historical comparisons (needed for SR-PROG-002).

### SR-CV-004 — Analysis result persistence
**Description:** Store the full structured analysis result (measurements + confidences + metadata) associated with the video.
**Priority:** Must
**Maps to:** FR-06
**Dependencies:** SR-CV-003
**Acceptance criteria:**
- Result is queryable independently of re-running the pipeline.
- Raw landmark data is retained for a defined period to allow re-derivation if a measurement formula is corrected (see [04-database.md](./04-database.md) §Retention).

---

## COACH — Coaching Engine

### SR-COACH-001 — Issue detection
**Description:** Compare each technique measurement against defined thresholds/reference ranges to detect candidate issues.
**Priority:** Must
**Maps to:** FR-07
**Dependencies:** SR-CV-003
**Acceptance criteria:**
- Thresholds are defined per measurement and versioned (see [08-coaching-engine.md](./08-coaching-engine.md)).
- A measurement with confidence below a defined floor does not generate an issue claim (produces "insufficient confidence" state instead — see SR-COACH-004).

### SR-COACH-002 — Root cause & severity assignment
**Description:** Each detected issue is assigned a probable root cause (from a defined taxonomy) and a severity score.
**Priority:** Must
**Maps to:** FR-07
**Dependencies:** SR-COACH-001
**Acceptance criteria:**
- Root cause is selected from the fixed taxonomy in [08-coaching-engine.md](./08-coaching-engine.md) §3, not freely generated by the LLM layer.
- Severity score is deterministic given the measurement deviation (rule-based), not LLM-generated.

### SR-COACH-003 — Single-issue prioritisation
**Description:** From all detected issues, select exactly one as the primary recommendation using a defined priority function (severity × confidence × coachability).
**Priority:** Must
**Maps to:** FR-08
**Dependencies:** SR-COACH-002
**Acceptance criteria:**
- Priority function is deterministic and documented (see [08-coaching-engine.md](./08-coaching-engine.md) §7); given the same inputs it always ranks the same.
- If zero issues clear the confidence floor, the system returns an explicit "not enough to diagnose confidently" result rather than fabricating a top issue.
- Non-selected issues are retained in the result payload (not discarded) even though only one is surfaced as primary (FR-08).

### SR-COACH-004 — Confidence-labelled output
**Description:** Every observation, measurement, interpretation, and recommendation in the output is explicitly tagged with its type and a confidence level.
**Priority:** Must
**Maps to:** FR-16, NFR-05
**Dependencies:** SR-COACH-003
**Acceptance criteria:**
- Data model enforces the observation/measurement/interpretation/recommendation distinction (see [06-ai-architecture.md](./06-ai-architecture.md) §5) — it is not just a UI convention layered on undifferentiated text.
- Confidence is surfaced to the player in plain language ("high/medium/low confidence" or equivalent), not just a raw number.

### SR-COACH-005 — Plain-language explanation generation
**Description:** Generate a plain-language explanation of the primary issue using the LLM coaching layer, grounded in the specific measurement/root cause (not freely generated).
**Priority:** Must
**Maps to:** FR-09
**Dependencies:** SR-COACH-003
**Acceptance criteria:**
- The LLM prompt is constructed from structured facts (measurement value, root cause, severity) — the LLM does not receive raw video or invent facts not present in the structured input.
- Output is validated against a schema before being shown to the player (see [06-ai-architecture.md](./06-ai-architecture.md) §2); malformed output triggers a safe fallback template, never a raw/unvalidated LLM string.

### SR-COACH-006 — Drill matching
**Description:** Select exactly one drill from the drill library matched to the primary issue's root cause.
**Priority:** Must
**Maps to:** FR-10
**Dependencies:** SR-COACH-003, SR-DRILL-001
**Acceptance criteria:**
- Every root cause in the taxonomy has at least one mapped drill (enforced at data level — no orphaned root causes).
- If multiple drills map to a root cause, selection is deterministic (defined tie-break rule), not random per request.

---

## DRILL — Drill Library & Completion

### SR-DRILL-001 — Drill library data
**Description:** Maintain a curated library of drills, each with instructions, target root cause(s), and difficulty/level tag.
**Priority:** Must
**Maps to:** FR-10
**Dependencies:** None
**Acceptance criteria:**
- Drill content is structured data (title, steps, equipment, video/image reference, target root cause), not free text blobs.
- Content is editable by the product/coaching team without a code deploy (see [04-database.md](./04-database.md)).

### SR-DRILL-002 — Mark drill complete
**Description:** Player can mark a prescribed drill as completed.
**Priority:** Must
**Maps to:** FR-11
**Dependencies:** SR-COACH-006
**Acceptance criteria:**
- Completion is timestamped and linked to the specific issue/session it was prescribed for.
- Marking complete does not itself trigger analysis — it only unlocks the "record follow-up" prompt (separation of self-report from measured outcome).

---

## PROG — Progress / Re-measurement

### SR-PROG-001 — Follow-up video submission against an issue
**Description:** Player can submit a new video explicitly linked to a prior issue for re-measurement.
**Priority:** Must
**Maps to:** FR-12
**Dependencies:** SR-DRILL-002, SR-VID-004
**Acceptance criteria:**
- Follow-up video goes through the same suitability validation (SR-VID-004) as any submission.
- The link between follow-up and original issue is explicit in the data model, not inferred by recency.

### SR-PROG-002 — Comparative verdict
**Description:** Re-run only the specific measurement(s) relevant to the original issue against the follow-up video and compare to the original value.
**Priority:** Must
**Maps to:** FR-13
**Dependencies:** SR-PROG-001, SR-CV-003
**Acceptance criteria:**
- Comparison uses the same measurement formula version as the original where possible; if the formula has since changed, this is flagged rather than silently comparing incompatible values (see SR-CV-003).
- Verdict is one of a defined set (`improved`, `no material change`, `regressed`, `inconclusive — low confidence`) plus the underlying numbers, not just a numeric delta.
- `inconclusive — low confidence` is returned rather than a false positive/negative when either measurement's confidence is below the floor.

---

## HIST — History

### SR-HIST-001 — Session history
**Description:** Player can view a chronological list of past sessions (video submitted, issue diagnosed, drill prescribed, outcome).
**Priority:** Should
**Maps to:** FR-14, US-11
**Dependencies:** SR-COACH-003, SR-PROG-002
**Acceptance criteria:**
- History reflects real stored state, not recomputed on the fly in a way that could diverge from what was originally shown to the player.

---

## DATA — Data Lifecycle

### SR-DATA-001 — Account & data deletion
**Description:** Player can request deletion of their account and all associated personal data (profile, videos, analyses).
**Priority:** Must
**Maps to:** FR-15, US-15
**Dependencies:** SR-AUTH-001
**Acceptance criteria:**
- Video files are removed from object storage, not merely unlinked in the database.
- Deletion completes within the timeframe committed to in the privacy policy (see [11-security.md](./11-security.md)).
- Deletion is confirmable by the user (explicit confirmation step) given its irreversibility.

### SR-DATA-002 — Retention limits
**Description:** Raw video and raw landmark data are retained only as long as needed for the product's own re-measurement/re-derivation purposes, per a defined retention policy.
**Priority:** Should
**Maps to:** NFR-03
**Dependencies:** SR-CV-004
**Acceptance criteria:**
- Retention period is explicit and documented (see [04-database.md](./04-database.md) §Retention, [11-security.md](./11-security.md)).
- Expiry is enforced by an automated job, not a manual process.

---

## Traceability Summary

Every `Must` product requirement in [01-product-requirements.md](./01-product-requirements.md) §3–4 maps to at least one `SR-*` above. This table is re-verified whenever either document changes:

`FR-01`→AUTH-001,002 · `FR-02`→PROF-001 · `FR-03`→VID-001,003 · `FR-04`→VID-002 · `FR-05`→VID-004 · `FR-06`→CV-001..004 · `FR-07`→COACH-001,002 · `FR-08`→COACH-003 · `FR-09`→COACH-005 · `FR-10`→COACH-006,DRILL-001 · `FR-11`→DRILL-002 · `FR-12`→PROG-001 · `FR-13`→PROG-002 · `FR-14`→HIST-001 · `FR-15`→DATA-001 · `FR-16`→COACH-004.
