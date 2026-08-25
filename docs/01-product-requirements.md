# 01 — Product Requirements

**Status:** Draft v1
**Depends on:** [00-product-vision.md](./00-product-vision.md)
**Feeds into:** [02-software-requirements.md](./02-software-requirements.md), [09-ux-specification.md](./09-ux-specification.md), [roadmap/00-mvp.md](../roadmap/00-mvp.md)

---

## 1. MVP Definition

The MVP delivers **one complete pass of the OBSERVE → ANALYSE → DIAGNOSE → PRIORITISE → PRESCRIBE → TRAIN → MEASURE → IMPROVE loop**, scoped as narrowly as possible while still being genuinely useful and defensibly "AI coaching," not a gimmick.

**In scope for MVP:**
- **One discipline:** batting only.
- **One shot family:** front-foot drive (straight drive / cover drive / on-drive), played off a throwdown, feed, or stationary ball — not live bowling. This shot is chosen because it has well-understood, teachable technique markers that are measurable from pose data alone (see [07-computer-vision.md](./07-computer-vision.md)), without needing ball-tracking.
- **One video angle required:** side-on. Front-on is optional/future (see NFR and exclusions below).
- **A fixed technique-marker set** (defined in [08-coaching-engine.md](./08-coaching-engine.md) §2): head stability, balance/weight transfer, backlift alignment, front elbow height, base/stance width, follow-through shape.
- Diagnosis of the single highest-priority issue from that marker set, in plain language, with an honest confidence statement.
- One prescribed drill addressing that issue.
- Player marks the drill complete and re-records.
- Cricket AI re-measures the same marker and reports whether it moved, by how much, and how confident it is in that measurement.
- A simple history view showing this loop over time for one player.

> **Assumption requiring validation:** Restricting v1 to a single shot family and a single camera angle is a scope decision to keep the CV pipeline tractable and the coaching output trustworthy. Confirm this matches your intended v1 before build starts — widening either significantly increases CV and coaching-engine complexity (see [07-computer-vision.md](./07-computer-vision.md) §7).

## 2. User Stories

| ID | Story | Priority |
|---|---|---|
| US-01 | As a player, I can create an account and set up a basic profile (name, age band, dominant hand, playing level) so the app knows who I am. | Must |
| US-02 | As a player, I can record a video of myself playing a front-foot drive directly in the app, side-on, with on-screen guidance for camera placement. | Must |
| US-03 | As a player, I can instead upload an existing video from my camera roll. | Should |
| US-04 | As a player, after submitting a video I can see clear progress/status while it's being analysed, so I know the app is working and roughly how long to wait. | Must |
| US-05 | As a player, I receive one clear, prioritised issue to work on — not a list of everything that might be wrong. | Must |
| US-06 | As a player, I get a plain-language explanation of *what* is happening and *why* it matters to my batting, not just a technical label. | Must |
| US-07 | As a player, I'm told how confident Cricket AI is in this observation, so I know whether to fully trust it. | Must |
| US-08 | As a player, I'm given one specific drill to fix the issue, with clear instructions on how to do it. | Must |
| US-09 | As a player, I can mark a drill as completed. | Must |
| US-10 | As a player, I can record a follow-up video and see whether the specific thing I worked on actually improved. | Must |
| US-11 | As a player, I can see my history of sessions and improvements over time. | Should |
| US-12 | As a player, I can see a short side-by-side comparison of my before/after video at the relevant moment (e.g. point of contact). | Should |
| US-13 | As a parent/coach, I can view a player's progress if the player has shared access with me. | Could (post-MVP; see exclusions) |
| US-14 | As a player, if my video quality is unsuitable for analysis (bad angle, too far away, obstructed), I'm told clearly why and how to fix it, before or instead of a low-quality analysis. | Must |
| US-15 | As a player, I can delete my videos and account data. | Must |

## 3. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | The system must allow account creation and authentication (email + password, and at least one social/OAuth option). | Must |
| FR-02 | The system must capture a minimal player profile: display name, date of birth or age band, batting hand, playing level (junior club / senior club / school / other). | Must |
| FR-03 | The system must support in-app video recording with on-screen framing guidance for a side-on shot. | Must |
| FR-04 | The system must support upload of a pre-recorded video (common mobile formats: mp4/mov). | Should |
| FR-05 | The system must validate video suitability (duration, resolution, framing/angle heuristic, player visibility) before running full analysis, and reject/flag unsuitable videos with a specific reason. | Must |
| FR-06 | The system must run a pose-estimation-based analysis pipeline against the submitted video and produce a structured set of technique measurements (see [07-computer-vision.md](./07-computer-vision.md)). | Must |
| FR-07 | The system must convert measurements into diagnosed issues with an associated root cause, severity, and confidence (see [08-coaching-engine.md](./08-coaching-engine.md)). | Must |
| FR-08 | The system must select exactly one top-priority issue per analysis to present as the primary recommendation. Other detected issues, if any, must not be hidden entirely but must be clearly subordinated (see [09-ux-specification.md](./09-ux-specification.md) §Results screen). | Must |
| FR-09 | The system must generate a plain-language explanation of the prioritised issue via the AI coaching layer, referencing the specific measurement it's based on. | Must |
| FR-10 | The system must prescribe exactly one drill matched to the diagnosed issue from a curated drill library. | Must |
| FR-11 | The system must let the player mark a prescribed drill as completed, with a timestamp. | Must |
| FR-12 | The system must let the player submit a follow-up video against an existing issue/session and re-run the relevant measurement. | Must |
| FR-13 | The system must compare the follow-up measurement to the original and present a plain-language improvement verdict with confidence, not just raw numbers. | Must |
| FR-14 | The system must persist a per-player history of sessions, issues, drills, and outcomes. | Should |
| FR-15 | The system must allow a player to delete their account and all associated video/data. | Must |
| FR-16 | The system must never present a measurement or diagnosis derived from insufficient/low-confidence data as if it were certain (see [06-ai-architecture.md](./06-ai-architecture.md) §5). | Must |

## 4. Non-Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| NFR-01 | **Performance:** A submitted video should return a complete analysis within 3 minutes for a video ≤ 30 seconds, under normal load. | Must |
| NFR-02 | **Reliability:** The video processing pipeline must not silently fail — every submission ends in a definite state (analysed, rejected-with-reason, or failed-with-retry-option) visible to the player. | Must |
| NFR-03 | **Privacy:** Player video is personal (and for minors, potentially child) data. Storage, access and retention must meet Australian Privacy Principles at minimum (see [11-security.md](./11-security.md)). | Must |
| NFR-04 | **Mobile-first:** The primary experience must be a mobile app; no v1 requirement for a full-featured web app beyond a minimal marketing site. | Must |
| NFR-05 | **Honesty of AI output:** Every AI-generated observation, measurement, interpretation, and recommendation must be distinguishable from one another in both the underlying data model and the UI (see [06-ai-architecture.md](./06-ai-architecture.md) §5). | Must |
| NFR-06 | **Accessibility:** Core flows must meet WCAG 2.1 AA where applicable to a mobile app context (contrast, text scaling, screen-reader labelling on primary actions). | Should |
| NFR-07 | **Scalability posture:** The architecture must not preclude scaling to additional shots/disciplines and higher video volume without a full rebuild, even though v1 does not build those features (see [03-system-architecture.md](./03-system-architecture.md) §12). | Must |
| NFR-08 | **Cost containment:** Video/CV processing cost per analysis must be tracked and bounded — no unbounded reprocessing loops. | Should |

## 5. User Journeys

### Journey A — First-time full loop
1. Player installs app, signs up, completes minimal profile.
2. Onboarding explains the shot to film and how to position the camera (side-on).
3. Player records or uploads their front-foot drive.
4. App validates the video; if unsuitable, explains why and lets the player retry.
5. Player sees an analysis-in-progress state.
6. Player receives: one prioritised issue, plain-language explanation, confidence level, one drill.
7. Player marks the drill as something they'll do; later returns and marks it complete.
8. Player records a follow-up video against the same issue.
9. App re-measures and reports the verdict (improved / no material change / worse), with confidence.
10. Player sees this session added to their history.

### Journey B — Unsuitable video
1–4 as above, but validation fails (e.g. camera front-on instead of side-on, player too far from camera, video too short).
5. Player is shown the specific problem and a corrective tip, and prompted to re-record. No AI analysis is attempted on unsuitable footage.

### Journey C — Returning player checking history
1. Player opens app, goes to history/profile.
2. Sees prior sessions, issues addressed, and improvement outcomes over time.

## 6. Feature Priorities (MoSCoW)

**Must have (v1 cannot ship without):** FR-01, FR-02, FR-03, FR-05, FR-06, FR-07, FR-08, FR-09, FR-10, FR-11, FR-12, FR-13, FR-15, FR-16; NFR-01 through NFR-05, NFR-07.

**Should have (target for v1, may slip to fast-follow):** FR-04, FR-14; NFR-06, NFR-08.

**Could have (explicitly nice-to-have, not blocking):** side-by-side video comparison polish, front-on secondary angle capture, coach/parent shared viewing (US-13).

**Won't have in v1:** see §8.

## 7. Acceptance Criteria (product-level)

The MVP is considered complete when a real player can, unassisted after onboarding:
1. Record a side-on video of a front-foot drive and submit it.
2. Receive a single prioritised, plainly-explained issue with a stated confidence level, within the performance target (NFR-01).
3. Receive one specific drill.
4. Mark the drill complete.
5. Submit a follow-up video and receive a plain-language, confidence-qualified verdict on whether the specific issue improved.
6. See both sessions reflected in their history.
7. Delete their account and have associated video data removed.

Each of these is broken into testable acceptance criteria per feature in [02-software-requirements.md](./02-software-requirements.md) and per milestone in `/roadmap`.

## 8. Explicitly Excluded Features (v1)

To protect scope, the following are **explicitly not built in v1**, regardless of how natural they may seem to add:

- Bowling, fielding, wicketkeeping analysis of any kind.
- Any shot type other than the front-foot drive family.
- Ball detection, ball-tracking, or line/length-relative analysis.
- Live/real-time analysis during bowling or in-match use.
- Match intelligence, tactical/decision-making analysis.
- Coach or academy dashboards, multi-player squad views.
- Team analysis.
- Payments/subscriptions (architecture may anticipate this; no payment flow ships).
- Push notification campaigns beyond a minimal "analysis ready" notification (may slip to fast-follow — see [roadmap/00-mvp.md](../roadmap/00-mvp.md)).
- Social features (sharing, feeds, comparing against other players).
- Web app beyond a minimal marketing/landing site.
- Multi-language support (English only, Australian conventions).
- Parent/coach shared-access accounts (US-13 is Could-have; data model should not preclude it, but no UI ships).

Any request to build one of these before the MVP loop (§7) is stable and shipped should be treated as a scope conflict and raised explicitly, per the master development rule.
