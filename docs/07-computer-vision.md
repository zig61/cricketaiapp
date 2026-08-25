# 07 — Computer Vision

**Status:** Draft v1
**Depends on:** [03-system-architecture.md](./03-system-architecture.md) §9, [06-ai-architecture.md](./06-ai-architecture.md)
**Feeds into:** [08-coaching-engine.md](./08-coaching-engine.md), [02-software-requirements.md](./02-software-requirements.md) (`CV-*`)

## 0. Honesty Principle

This document exists to prevent the single most damaging failure mode for an AI coaching product: **claiming a measurement is accurate when the underlying technology can't actually support it.** Every capability below is labelled with what it actually is:

- 🟢 **Implementable now** — open-source/well-validated technology, works today with normal engineering effort.
- 🟡 **Requires third-party service** — technically available, but depends on an external paid vendor; a build-vs-buy decision, not an R&D risk.
- 🟠 **Requires custom ML model** — no off-the-shelf model does this well for cricket; would need cricket-specific training data and model development. Real project, not a v1 task.
- 🔴 **Future research** — not reliably solvable with current mainstream techniques at acceptable cost/accuracy; do not commit to this in any roadmap or marketing claim.

**The v1 measurement set (see §6) was deliberately chosen to use only 🟢 capabilities.** This is why v1 is scoped to body-landmark-derived measurements and explicitly excludes anything requiring bat or ball detection.

## 1. Video Ingestion

🟢 **Implementable now.** Player-recorded or uploaded mp4/mov, capped at 15s (SR-VID-001/002), uploaded directly to Supabase Storage. No CV work happens here — see [03-system-architecture.md](./03-system-architecture.md) §7 for the upload flow.

## 2. Frame Extraction

🟢 **Implementable now.** Using ffmpeg (or equivalent) in the CV microservice, sample frames at a fixed rate (target: the video's native frame rate, typically 30fps, for a 15s clip — ≈450 frames, downsampled if needed to bound processing cost). A motion-based heuristic identifies the approximate contact-point frame (peak wrist/bat-arm velocity followed by deceleration) to anchor the phase segmentation (stance / backlift / downswing / contact / follow-through) used by the measurement formulas in §6.

**Honest limitation:** this heuristic estimates contact timing from body motion, not from actual bat-ball contact (which would require ball/bat detection — see §5/§6 below). It is accurate enough to segment shot phases for body-landmark measurements but must never be described to the player as "the moment of contact" with certainty — it's an estimate, and its own confidence is tracked and propagated (§9).

## 3. Pose Estimation

🟢 **Implementable now.** MediaPipe Pose (Google, open-source, Apache 2.0), self-hosted in the Python CV microservice. Produces 33 body landmarks per frame (head, shoulders, elbows, wrists, hips, knees, ankles, plus additional facial/hand points not used in v1) with a per-landmark visibility/confidence score.

**Honest limitation:** pose estimation accuracy degrades with occlusion (e.g. front arm/bat obscuring the torso at certain angles), motion blur on fast movements, poor lighting, and players wearing loose clothing that obscures joint position. This is precisely why per-landmark confidence is retained and propagated into every downstream measurement (SR-CV-002) rather than discarded after use.

**Handedness:** analysis must mirror correctly for left-handed batters (SR-PROF-001); this is a straightforward geometric transform, not a CV limitation, but is called out because getting it wrong silently would produce confidently wrong measurements for left-handed players.

## 4. Body Landmarks

🟢 **Implementable now** — see §3. The v1 landmark subset used: nose (head proxy), left/right shoulder, left/right elbow, left/right wrist, left/right hip, left/right knee, left/right ankle.

## 5. Bat Detection

🟠 **Requires custom ML model.** No general-purpose object detector reliably distinguishes a cricket bat's orientation and edge/face direction from a phone-quality video out of the box. This would require a purpose-collected, purpose-labelled cricket dataset and a fine-tuned detection model (e.g. a YOLO-family model trained on annotated bat position/orientation). **Not attempted in v1.** Any v1 measurement that would require knowing bat face angle or swing path relative to the bat itself (as opposed to arm/body motion, which is available from pose data) is explicitly excluded from the v1 measurement set (§6).

## 6. Ball Detection

🔴 **Future research**, not 🟠, and this distinction matters: a cricket ball is small, fast, and frequently motion-blurred even on a throwdown/feed at typical smartphone frame rates (30–60fps); reliable tracking at match ball speeds typically needs high-speed camera capture (120fps+) and/or fixed multi-camera rigs, which is not a "train a model" problem alone — it's a capture-hardware problem too. **v1 makes no attempt at ball detection or tracking.** This is why v1's shot family (front-foot drive off a throwdown) and measurement set were chosen specifically to not depend on knowing where the ball was, is, or its line/length. Any future claim about line/length-relative technique analysis (e.g. "you played across the line of a good-length ball") depends on this being solved first — treat it as a distinct, hard research investment, not an incremental extension.

## 7. Shot Classification

🟢 **Implementable now, but not needed in v1** / 🟠 **Requires custom ML model for general multi-shot classification.** In v1, the player self-declares the shot they're filming (front-foot drive — the only option offered, per [01-product-requirements.md](./01-product-requirements.md) §1), so automatic shot classification is not on the v1 critical path. The suitability check (SR-VID-004) instead uses coarse motion heuristics to confirm *a* batting-like swing motion occurred and the camera angle/framing is usable — it does not attempt to identify *which* shot was played. Distinguishing shot types automatically (drive vs cut vs pull vs defensive, etc.) across a wide shot vocabulary would need a trained classifier over labelled shot video and is future scope tied to widening beyond one shot family (see [01-product-requirements.md](./01-product-requirements.md) §8 exclusions).

## 8. Technique Measurements (v1 set)

🟢 **Implementable now** — all six v1 measurements are derived purely from body-landmark trajectories (§3/§4), which is exactly why this set was chosen. Each is a **versioned, deterministic formula** (SR-CV-003), not a model output:

| Marker key | What it measures | Landmarks used | Formula sketch |
|---|---|---|---|
| `head_stability` | Lateral head drift from stance to contact-estimate frame | nose | Max lateral displacement of nose position (normalised by shoulder width) between stance frame and contact-estimate frame |
| `balance_weight_transfer` | Weight transfer toward the front foot through the shot | hips, ankles | Hip-centre horizontal displacement relative to front-ankle position, stance → contact-estimate |
| `backlift_alignment` | Whether the backlift stays in a coachable plane (straight) vs sweeps noticeably across the body | wrists, shoulders | Angle of the wrist-to-shoulder vector at peak backlift frame vs a reference vertical |
| `front_elbow_height` | Front elbow position at contact-estimate, a common drive-technique marker | front elbow, front shoulder | Vertical angle of upper arm at contact-estimate frame |
| `base_width` | Stance width as a stability proxy | ankles | Ankle-to-ankle distance normalised by hip width, at stance frame |
| `follow_through_shape` | Whether the follow-through completes in a coachable arc vs stops short/wraps early | wrists, shoulders | Wrist trajectory arc length and end-angle over the follow-through phase |

Reference ranges per marker (what counts as "in range" vs an issue) are defined and versioned in [08-coaching-engine.md](./08-coaching-engine.md) §4 — this document defines *what is measured*, that document defines *what it means*.

**Explicitly excluded from v1 (why):** bat swing path/face angle (needs §5), anything relative to ball line/length (needs §6), shot-specific footwork toward a specific delivery (needs §6). These are not weaker versions of v1 measurements — they are categorically blocked on capabilities that don't exist yet.

## 9. Confidence Scoring

🟢 **Implementable now.** Each measurement's confidence is derived from: (a) the mean per-landmark visibility score across the relevant frames from MediaPipe, (b) frame coverage (were the needed phase frames actually identified, or estimated from sparse data), and (c) the contact-point-estimate confidence from §2. This composite confidence is what feeds the floors in [06-ai-architecture.md](./06-ai-architecture.md) §7. The exact weighting formula is implementation detail owned by the CV microservice and versioned alongside the measurement formulas (SR-CV-003).

## 10. Analysis Pipeline

🟢 **Implementable now.** Full sequence diagram in [03-system-architecture.md](./03-system-architecture.md) §7. Summary of the CV microservice's contract: given a video reference, return (a) suitability verdict + reason (SR-VID-004), or (b) landmarks + measurements + confidences (SR-CV-002/003) for a suitable video. The microservice is stateless; the Coordinator API persists results.

## 11. Results Format

🟢 **Implementable now.** JSON, matching the `measurements` table shape ([04-database.md](./04-database.md)):
```json
{
  "suitable": true,
  "rejectionReason": null,
  "contactFrameEstimate": { "frameIndex": 142, "confidence": 0.81 },
  "measurements": [
    { "markerKey": "head_stability", "value": 7.2, "unit": "degrees", "confidence": 0.86 },
    { "markerKey": "balance_weight_transfer", "value": 0.62, "unit": "normalised_ratio", "confidence": 0.74 }
  ],
  "landmarksStoragePath": "analyses/<uuid>/landmarks.json",
  "formulaVersion": "2026.08.1"
}
```
Raw landmark JSON (full per-frame data) is written to Storage, not returned inline, per [04-database.md](./04-database.md) §1 `analyses.landmarks_storage_path` and the 12-month retention policy in §6 of that document.

## 12. Summary Capability Table

| Capability | Label | v1 status |
|---|---|---|
| Frame extraction | 🟢 Implementable now | Built |
| Pose estimation (body landmarks) | 🟢 Implementable now | Built |
| Body-landmark-derived technique measurements (§8 set) | 🟢 Implementable now | Built |
| Confidence scoring | 🟢 Implementable now | Built |
| Shot self-declaration + coarse suitability heuristic | 🟢 Implementable now | Built |
| Automatic multi-shot classification | 🟠 Requires custom ML model | Not built — post-v1, tied to widening shot coverage |
| Bat detection / bat face angle | 🟠 Requires custom ML model | Not built — no committed timeline |
| Ball detection / tracking | 🔴 Future research | Not built — no committed timeline; hardware-dependent |
| Line/length-relative footwork analysis | 🔴 Future research | Blocked on ball detection |

No product copy, marketing material, or roadmap document should imply capability beyond what's marked 🟢 for anything currently shipped.
