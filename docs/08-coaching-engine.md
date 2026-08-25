# 08 — Coaching Engine

**Status:** Draft v1 — **numeric thresholds below are initial hypotheses, not validated science. See §9.**
**Depends on:** [07-computer-vision.md](./07-computer-vision.md), [06-ai-architecture.md](./06-ai-architecture.md)
**Feeds into:** [02-software-requirements.md](./02-software-requirements.md) (`COACH-*`), [04-database.md](./04-database.md)

This document converts the coaching hierarchy from [00-product-vision.md](./00-product-vision.md) — *identify the skill → what happened → why → does it matter → prioritise → explain → correct → drill → measure* — into deterministic software logic.

## 1. Skills

v1 seeds exactly one row in `skills` ([04-database.md](./04-database.md)): **Batting**. The taxonomy below (sub-skills → root causes → drills) is structured so bowling/fielding/wicketkeeping can be added as sibling skills later without restructuring.

## 2. Sub-Skills

v1 seeds exactly one row in `sub_skills`: **Front-foot drive**, scoped per [01-product-requirements.md](./01-product-requirements.md) §1.

## 3. Errors → Root Cause Taxonomy

**Important scoping honesty:** v1's root causes are defined at the level of the technique deviation itself — the thing that is directly measurable from pose data ([07-computer-vision.md](./07-computer-vision.md) §8). They are not deeper causal chains (e.g. "backlift problem *caused by* grip"), because diagnosing a cause behind the measured deviation would require capabilities (e.g. hand/grip tracking) not built in v1. This is a deliberate limit, not an oversight — see [07-computer-vision.md](./07-computer-vision.md) §0.

The six v1 root causes map 1:1 to the six measurement markers:

| Root cause key | Name | Triggering marker | Plain-language definition |
|---|---|---|---|
| `head_falling_away` | Head falling away | `head_stability` | Head drifts sideways away from the ball line between backlift and contact, instead of staying still and level. |
| `weight_transfer_incomplete` | Incomplete weight transfer | `balance_weight_transfer` | Weight doesn't move convincingly onto the front foot through the shot, leaving the player on the back foot at contact. |
| `backlift_across_line` | Backlift across the line | `backlift_alignment` | Bat swings back on a noticeably angled path across the body rather than a straight line. |
| `front_elbow_collapsed` | Front elbow collapsed | `front_elbow_height` | Front elbow drops low at the point of contact instead of staying elevated, reducing control through the shot. |
| `base_unstable` | Unstable base | `base_width` | Stance is notably too narrow or too wide relative to a stable reference, undermining balance from the start. |
| `follow_through_cut_short` | Follow-through cut short | `follow_through_shape` | Bat swing stops abruptly instead of completing a full arc, usually indicating tension or mistimed contact. |

Every root cause must have at least one mapped drill (§8) — enforced at the data level ([04-database.md](./04-database.md) §4).

## 4. Reference Ranges & Issue Detection (SR-COACH-001)

A measurement becomes a **candidate issue** when its value falls outside the defined reference range for that marker, **and** its own confidence clears the floor from [06-ai-architecture.md](./06-ai-architecture.md) §7 (0.5). Below-floor measurements never become issues — they're simply not measured confidently enough to say anything.

| Marker | Reference range (in-range = no issue) | Unit |
|---|---|---|
| `head_stability` | 0–4 | degrees lateral drift |
| `balance_weight_transfer` | 0.55–1.0 | normalised ratio (1.0 = full transfer) |
| `backlift_alignment` | 0–8 | degrees deviation from straight |
| `front_elbow_height` | 100–140 | degrees (upper arm elevation) |
| `base_width` | 0.9–1.3 | ratio to hip width |
| `follow_through_shape` | ≥ 0.7 | completion score (0–1) |

## 5. Severity (SR-COACH-002)

Deterministic, not LLM-generated. Severity is the normalised distance of the measured value outside its reference range, clamped to `[0, 1]`:

```
severity = clamp(|value - nearest_range_boundary| / severity_scale, 0, 1)
```
where `severity_scale` is a per-marker constant representing "how far outside range counts as maximally severe" (e.g. for `head_stability`, a drift of 12°+ is treated as severity 1.0; values above the scale clamp rather than exceed 1.0). Per-marker `severity_scale` values are set alongside the reference ranges in §4 and are versioned with the measurement formula version ([04-database.md](./04-database.md) `analyses.measurement_formula_version`).

## 6. Confidence

Carried through unchanged from the measurement's own confidence ([07-computer-vision.md](./07-computer-vision.md) §9) — the coaching engine does not independently re-derive confidence, it consumes it. An issue's `confidence` equals its source measurement's `confidence`.

## 7. Priority (SR-COACH-003)

Exactly one issue is selected as primary per analysis:

```
priority = severity × confidence × coachability_weight
primary_issue = argmax(priority) over all candidate issues, where confidence ≥ 0.6
```

`coachability_weight` is a per-root-cause constant reflecting how reliably a single drill tends to move the needle on that issue. **v1 sets every root cause's `coachability_weight` to 1.0** — there is no real basis yet to differentiate them, and inventing differentiated weights without evidence would be exactly the kind of false precision this document is trying to avoid (§9). The multiplier exists in the formula so it can be tuned later from real completion/improvement data without a formula redesign.

If no candidate issue reaches confidence ≥ 0.6, **no primary issue is selected** — the player receives the "not enough to diagnose confidently" result (SR-COACH-003), never a forced pick from low-confidence candidates. Ties in `priority` are broken by lowest `root_cause_id` (stable, arbitrary but deterministic) — in practice, ties are expected to be rare given continuous severity/confidence values.

## 8. Coaching Cues & Drills (SR-COACH-006)

One primary drill per root cause in v1 (no alternates, no difficulty-tiered progression yet — see §10):

| Root cause | Coaching cue (shown alongside explanation) | Prescribed drill |
|---|---|---|
| `head_falling_away` | "Keep your eyes level and still through the shot." | **Wall Head-Still Drill** — shadow-bat close to a wall/mirror; any head movement is immediately visible; 3 sets of 10 slow-motion shots. |
| `weight_transfer_incomplete` | "Feel your weight arrive on your front foot as bat meets ball." | **Step-and-Drive Drill** — exaggerated front-foot step onto a marked spot before playing the shot off a stationary ball, building the weight-transfer habit before removing the marker. |
| `backlift_across_line` | "Take the bat back straight, toward the stumps behind you." | **Straight-Line Backlift Drill** — backlift performed against a bat/stick laid on the ground pointing at middle stump as a visual line reference. |
| `front_elbow_collapsed` | "Keep your front elbow up and pointing toward the bowler." | **High-Elbow Drive Drill** — slow-motion shadow drives with a focus cue on elbow height, using a mirror or partner check at the point of contact. |
| `base_unstable` | "Set a balanced, shoulder-width base before the ball is bowled." | **Balanced Stance Drill** — stance set-up repetitions against a shoulder-width floor marker, holding balance for 3 seconds before each shadow shot. |
| `follow_through_cut_short` | "Let the bat swing all the way through to a full finish." | **Full-Finish Drill** — shadow drives exaggerating a complete, high follow-through, focusing on relaxed arms rather than a defensive short-arm jab. |

Each drill is stored as structured content in the `drills` table ([04-database.md](./04-database.md)), editable by the coaching/content team without a code deploy (SR-DRILL-001).

## 9. On the Numeric Thresholds Above

**This is the most important caveat in this document.** The reference ranges (§4), severity scales (§5), and confidence floors ([06-ai-architecture.md](./06-ai-architecture.md) §7) are **initial engineering hypotheses**, set to plausible-looking values so the pipeline can be built and tested end-to-end — they are **not** derived from validated coaching/biomechanics data. Before this product makes real diagnostic claims to real players:

1. These thresholds need calibration against video labelled by qualified cricket coaches (does the system's "issue" agree with what a coach would actually flag?).
2. Confidence floors need calibration against known-good vs known-poor footage to check they actually separate reliable from unreliable measurements.
3. This calibration work should happen before public launch, and is a required milestone (see `/roadmap`), not an optional refinement.

Treat every number in §4–§7 as "engineering placeholder, needs coach validation" until that milestone is explicitly marked done.

## 10. Progressions (Explicitly Deferred)

v1 does not implement drill progressions (difficulty escalation, sequenced multi-drill plans) — see [06-ai-architecture.md](./06-ai-architecture.md) §9. The `difficulty_level` field on `drills` exists for this future use but is not read by any v1 selection logic; every root cause currently has exactly one prescribed drill regardless of severity.

## 11. Improvement Logic (SR-PROG-002)

On a follow-up video, only the marker tied to the original issue's root cause is re-measured (not a full re-analysis — see [02-software-requirements.md](./02-software-requirements.md) SR-PROG-002). The verdict is computed deterministically:

```
delta = followup_value - original_value   (sign-adjusted per marker so "improvement direction" is consistent)
if either confidence < 0.5:      verdict = inconclusive_low_confidence
elif |delta| < marker_min_meaningful_delta:  verdict = no_material_change
elif delta indicates movement toward reference range:  verdict = improved
else:                              verdict = regressed
```

`marker_min_meaningful_delta` is a per-marker constant (e.g. for `head_stability`, a change smaller than 1° is treated as noise, not real change) — set as an initial hypothesis alongside §4's ranges, subject to the same calibration caveat in §9.

## 12. Coaching Hierarchy Traceability

For reference, this is how the product-vision coaching hierarchy maps onto this document:

| Hierarchy step | Where it's implemented |
|---|---|
| Identify the skill | §1 |
| Identify what happened | §4 (issue detection) |
| Identify why it happened | §3 (root cause), with the explicit limit noted there |
| Does it matter | §5 (severity) |
| Prioritise | §7 |
| Explain simply | [06-ai-architecture.md](./06-ai-architecture.md) §2 (LLM call site A) |
| One correction + drill | §8 |
| Measure next attempt | §11 |
