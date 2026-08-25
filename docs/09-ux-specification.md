# 09 — UX Specification

**Status:** Draft v1
**Depends on:** [01-product-requirements.md](./01-product-requirements.md) §5 (User Journeys), [08-coaching-engine.md](./08-coaching-engine.md)
**Feeds into:** [10-design-system.md](./10-design-system.md), `/design`

Screens are listed in primary flow order. Two screens are explicitly **reused** rather than duplicated for the follow-up path — noted where relevant — to avoid the app feeling like two different products for "first video" vs "second video."

---

## 1. Onboarding / Welcome

**Purpose:** Set expectations before any account exists — what Cricket AI does, and what it needs from the player (a side-on video of one specific shot).
**User goal:** Understand what to do next and why, without reading a wall of text.
**Layout:** 2–3 sequential full-screen cards (swipe/tap through): (1) the loop in one line — "Record → Get one thing to fix → Train → Prove it worked", (2) what shot to film and how to hold the camera (illustrated), (3) sign-up CTA.
**Components:** Illustration/animation per card, progress dots, primary CTA button, "skip" affordance only on cards 1–2.
**Navigation:** Forward-only until final card; final card routes to Sign Up.
**States:** N/A (static content), single loading state while illustrations/video assets load.
**Errors:** N/A — no network dependency.
**Loading:** Asset preloading spinner only if needed; should be near-instant (bundled assets).
**Empty states:** N/A.
**Accessibility:** Each card's illustration has a text alternative; swipe gesture has an equivalent tap/button control.
**Mobile behaviour:** Full-screen, portrait-only (matches recording orientation later).

## 2. Sign Up / Sign In

**Purpose:** Create or access an account.
**User goal:** Get into the app with minimal friction.
**Layout:** Single screen, tab or toggle between Sign Up / Sign In; email+password fields; OAuth buttons (Apple, Google) above or below the divider per platform convention.
**Components:** Text inputs, password visibility toggle, OAuth buttons, primary CTA, inline validation messages, link to switch mode.
**Navigation:** Successful auth → Profile Setup (first time) or Home (returning, profile already complete).
**States:** Default, field-focused, field-error, submitting.
**Errors:** Invalid credentials (generic, non-enumerating — SR-AUTH-001), weak password (specific, actionable), network failure (retry affordance), OAuth cancelled/failed (return to form, no dead end).
**Loading:** Button shows inline spinner during submit; form fields disabled while submitting.
**Empty states:** N/A.
**Accessibility:** Labelled inputs, error messages associated via `aria`-equivalent RN accessibility props, minimum touch target 44×44pt.
**Mobile behaviour:** Keyboard-aware scroll (fields never hidden behind keyboard); autofill/password-manager compatible.

## 3. Profile Setup

**Purpose:** Capture the minimal profile required before any video can be submitted (SR-PROF-001).
**User goal:** Get through setup quickly and understand why each field is asked (especially DOB, for a first-time user who may be wary).
**Layout:** Single scrollable form: display name, DOB/age band, batting hand (segmented control: Left/Right), playing level (select).
**Components:** Text input, date picker, segmented control, select/picker, primary CTA (disabled until all required fields valid).
**Navigation:** Submit → Home. Cannot be skipped (blocks video submission per FR-02) but can be entered partially and resumed — if a user backgrounds the app mid-setup, they resume here on return, not at Sign In.
**States:** Default, field-error (e.g. underage-for-service if applicable — flag to legal, not assumed here), submitting.
**Errors:** Validation errors inline per field; submit failure shows a retry, preserves entered data.
**Loading:** Submit button spinner.
**Empty states:** N/A (form always has fields).
**Accessibility:** Date picker has an accessible text-entry fallback; segmented controls are individually focusable/labelled.
**Mobile behaviour:** Keyboard-aware; date picker uses native platform picker.

## 4. Home

**Purpose:** Single entry point reflecting the player's current position in the loop — this screen's content changes based on state, rather than being a static dashboard.
**User goal:** Immediately know "what do I do next?"
**Layout:** One primary state-dependent card plus a secondary "history" entry point:
- *No sessions yet:* "Record your first shot" CTA, brief reminder of what's needed.
- *Video processing:* status card ("Analysing your shot…") linking to Analysis In Progress.
- *Result ready, drill not yet marked complete:* summary card (root cause name, one-line explanation) + "See your drill" CTA.
- *Drill complete, no follow-up yet:* "Ready to see if it worked?" + "Record follow-up" CTA.
- *Follow-up complete:* verdict summary card + "Start a new session" CTA (loop restarts).
**Components:** State-dependent card, secondary nav to History and Profile/Settings (tab bar or header icons).
**Navigation:** Routes to Record Shot, Analysis In Progress, Analysis Results, Drill Detail, or Comparison Result depending on state; History and Profile always reachable.
**States:** The five bullet states above, each a distinct, testable UI state — not a single screen with optional sections.
**Errors:** If the underlying video is in a `failed` status, Home shows this explicitly with a retry CTA rather than silently reverting to "no sessions yet."
**Loading:** Skeleton card while initial state is being determined on app open.
**Empty states:** The "no sessions yet" state *is* the empty state — designed intentionally, not a blank screen.
**Accessibility:** State card's primary CTA is always the first focusable element after the header.
**Mobile behaviour:** Pull-to-refresh re-checks processing status.

## 5. Record Shot

**Purpose:** Capture a usable side-on video (SR-VID-001). **Reused** for both the initial recording and any follow-up recording — the only difference is a header label ("Recording: Follow-up for [issue]") and the linked-issue context passed through to submission.
**User goal:** Film the shot correctly on the first attempt.
**Layout:** Full-screen camera view with a translucent framing overlay (silhouette guide showing correct distance/angle), record button, a toggle to switch to Upload From Library instead.
**Components:** Camera preview, framing overlay graphic, record/stop button, countdown (optional 3s pre-roll so the player has time to get into position after tapping record), upload-instead link.
**Navigation:** Stop recording → Video Preview & Submit. Upload-instead → device picker → Video Preview & Submit.
**States:** Camera permission not yet granted, camera ready, recording (with elapsed time / max-duration countdown), recording stopped.
**Errors:** Camera permission denied — explicit screen explaining why it's needed and a deep link to system settings, not a silent dead end. Recording exceeds max duration — auto-stops at the cap (SR-VID-001) with a message, not a hard cut with no explanation.
**Loading:** N/A within this screen (camera starts near-instantly); if camera init is slow, a brief loading indicator over the preview area.
**Empty states:** N/A.
**Accessibility:** Record button has a clear accessible label distinct from "play" semantics; framing overlay has a text-alternative instruction for screen-reader users (camera framing itself is inherently visual, so this screen also surfaces the same guidance as text).
**Mobile behaviour:** Portrait-locked (matches the side-on framing assumption in [07-computer-vision.md](./07-computer-vision.md)); handles interruption (phone call, backgrounding) by discarding an in-progress recording safely, not corrupting it.

## 6. Video Preview & Submit

**Purpose:** Let the player confirm (or discard and retry) before committing to upload/processing.
**User goal:** Avoid submitting an obviously bad take.
**Layout:** Video playback of the just-recorded/selected clip, Retake and Submit buttons.
**Components:** Video player with scrub bar, Retake (secondary) and Submit (primary) buttons.
**Navigation:** Retake → back to Record Shot. Submit → upload begins → Analysis In Progress.
**States:** Playback ready, playback loading (large files), submitting (upload in progress).
**Errors:** Playback failure (corrupted capture) — clear message, forces Retake rather than allowing submission of an unplayable file. Upload failure — retry affordance, does not require re-recording (SR-VID-003 resumability).
**Loading:** Upload progress bar (this can take several seconds on poor connections — must show real progress, not an indeterminate spinner, given NFR-01's 3-minute total budget).
**Empty states:** N/A.
**Accessibility:** Video player controls are standard/native where possible for built-in accessibility support.
**Mobile behaviour:** Upload continues if the app is backgrounded briefly (background upload task), with the app able to reflect the correct state on return.

## 7. Analysis In Progress

**Purpose:** Keep the player informed and reassured while validation and analysis run (US-04).
**User goal:** Know the app is working and roughly how long to wait.
**Layout:** Progress indicator with staged labels reflecting the real pipeline stages ("Checking your video…", "Analysing your technique…") sourced from actual `status`/`processing_jobs` state, not a fake progress bar.
**Components:** Stepped progress indicator, cancel-and-return-to-Home affordance (does not cancel server-side processing, just navigates away — processing continues, Home will reflect the result when ready).
**Navigation:** Auto-navigates to Analysis Results on completion (via polling or Realtime subscription — SR-VID-005); auto-navigates to Video Rejected if validation fails.
**States:** `validating`, `analysing`, and the terminal transitions to `rejected`/`complete`/`failed`.
**Errors:** `failed` status shown with a retry CTA (SR-VID-005) — never leaves the player staring at an indefinite spinner.
**Loading:** This entire screen *is* a loading state; must feel alive (real stage labels, subtle motion) rather than a static spinner, per the "premium, intelligent" product philosophy.
**Empty states:** N/A.
**Accessibility:** Stage changes are announced to screen readers (accessibility live region equivalent).
**Mobile behaviour:** Push notification fires if the player backgrounds/closes the app during this stage (§10 of [03-system-architecture.md](./03-system-architecture.md)).

## 8. Video Rejected

**Purpose:** Turn a failed suitability check into a fixable next action (US-14), not a dead end.
**User goal:** Understand exactly what to fix and try again quickly.
**Layout:** Specific reason (from the finite reason-code set, SR-VID-004) shown in plain language with an illustration of the fix (e.g. "Try filming from directly side-on" with a diagram), Retry CTA.
**Components:** Reason illustration/text, Retry (→ Record Shot) primary CTA.
**Navigation:** Retry → Record Shot.
**States:** One state per reason code — each with its own tailored copy/illustration, not a generic "video not suitable" message.
**Errors:** N/A (this screen *is* the error state for the pipeline).
**Loading:** N/A.
**Empty states:** N/A.
**Accessibility:** Reason text is the primary content (not solely conveyed via illustration).
**Mobile behaviour:** Standard.

## 9. Analysis Results

**Purpose:** Deliver the core value moment — one prioritised, explained, confidence-qualified issue (FR-08/09, SR-COACH-004/005).
**User goal:** Understand the one thing to work on and trust the explanation.
**Layout:** Single-issue focused layout: root cause name as headline, confidence label prominently but non-alarmingly displayed, explanation broken into its distinguishable parts (observation → interpretation, per [06-ai-architecture.md](./06-ai-architecture.md) §7) — not one paragraph blending fact and inference, drill preview card with CTA into Drill Detail.
**Components:** Confidence badge, structured explanation text blocks, drill preview card, secondary "other things noticed" disclosure (collapsed by default — FR-08 requires not hiding other issues entirely, but they must stay clearly subordinate).
**Navigation:** Drill preview CTA → Drill Detail. Back → Home.
**States:** Normal (primary issue found), **no-confident-diagnosis state** (§7 of [08-coaching-engine.md](./08-coaching-engine.md) — when no issue clears the confidence floor: explicit message, tips to get a more analysable video, no forced recommendation).
**Errors:** If explanation generation failed and fell back to the safe template ([06-ai-architecture.md](./06-ai-architecture.md) §2), the player still sees a complete, correct (if less polished) result — never an error screen for this.
**Loading:** N/A (this screen only renders once data is ready — Analysis In Progress owns the loading state).
**Empty states:** The no-confident-diagnosis state, designed explicitly (see above), not a fallback afterthought.
**Accessibility:** Confidence label is conveyed in text, not colour alone.
**Mobile behaviour:** Scrollable single column; drill CTA remains reachable without excessive scrolling (sticky footer CTA if content is long).

## 10. Drill Detail

**Purpose:** Give clear instructions for the one prescribed drill and let the player mark it done (SR-DRILL-002).
**User goal:** Know exactly how to do the drill correctly.
**Layout:** Drill title, coaching cue, equipment needed, numbered step list, optional demonstration media, "Mark as complete" CTA.
**Components:** Step list, media player/image, primary CTA (toggles to a completed state, not a one-way irreversible action — a player can un-mark if tapped by mistake).
**Navigation:** Mark complete → Home updates to the "ready for follow-up" state (§4). Back → Analysis Results.
**States:** Not yet completed, completed (with completion timestamp shown).
**Errors:** Standard network-failure-on-save handling (retry, doesn't lose the completion intent).
**Loading:** Media asset loading state (if drill has demonstration video/image).
**Empty states:** N/A (drill content is always present when this screen is reachable).
**Accessibility:** Step list is a real ordered list (screen-reader navigable step by step).
**Mobile behaviour:** Media (if video) respects reduced-data/autoplay-off device settings.

## 11. Comparison Result

**Purpose:** Deliver the "did it work" moment (FR-13, US-10) — the loop's payoff.
**User goal:** Know clearly whether the specific thing they worked on improved.
**Layout:** Verdict headline (`improved`/`no material change`/`regressed`/`inconclusive`) in plain language, before/after values presented simply (not raw numbers alone — framed relative to the reference range), optional before/after video moment side-by-side (US-12, Should-have).
**Components:** Verdict badge, comparison visual, confidence label, "Start a new session" CTA (loop restart).
**Navigation:** CTA → Record Shot (new `initial` session) or Home.
**States:** Each of the four verdict values, each with distinct, honest framing — `regressed` and `inconclusive` are not soft-pedalled into looking like `improved`.
**Errors:** N/A beyond standard load failure (retry).
**Loading:** Skeleton while comparison data loads (should be near-instant, data already computed server-side by this point).
**Empty states:** N/A.
**Accessibility:** Verdict conveyed in text, not colour/icon alone.
**Mobile behaviour:** Side-by-side video (if built) must remain usable on small screens — stacked, not cramped, if horizontal space is insufficient.

## 12. History

**Purpose:** Show the player's development over time (SR-HIST-001, US-11).
**User goal:** See progress across sessions, feel a sense of accumulating improvement.
**Layout:** Reverse-chronological list of sessions, each row showing date, root cause addressed, drill, and outcome badge.
**Components:** List rows, empty-state illustration for a brand-new account.
**Navigation:** Tap a row → Session Detail (reuses Analysis Results / Comparison Result components in a read-only historic context).
**States:** Populated list, loading (pagination — cursor-based per [05-api.md](./05-api.md)), empty (no sessions yet — distinct from Home's empty state, framed as "your history will build up here").
**Errors:** Load failure — retry affordance, doesn't block the rest of the app.
**Loading:** Skeleton rows; infinite-scroll pagination loading indicator at list end.
**Empty states:** Explicit "no sessions yet" illustration + CTA back to recording, not a blank list.
**Accessibility:** List rows are individually focusable with a full accessible label (date + outcome), not relying on visual-only badge colour.
**Mobile behaviour:** Standard scrollable list, pull-to-refresh.

## 13. Profile & Settings

**Purpose:** Let the player manage their profile and account (SR-PROF-001, SR-DATA-001).
**User goal:** Update basic info, understand privacy, delete account if desired.
**Layout:** Profile fields (editable), links to privacy policy/terms, sign-out, delete-account entry point.
**Components:** Editable form fields, list-style navigation rows, destructive-styled delete-account row (visually distinct from other rows per [10-design-system.md](./10-design-system.md)).
**Navigation:** Delete account → Delete Account Confirmation.
**States:** View, editing, saving.
**Errors:** Save failure — inline retry, preserves edits.
**Loading:** Save button spinner.
**Empty states:** N/A.
**Accessibility:** Destructive action is clearly labelled as such for screen readers, not just colour-coded.
**Mobile behaviour:** Standard form screen.

## 14. Delete Account Confirmation

**Purpose:** Ensure account deletion (irreversible — SR-DATA-001) is a deliberate choice.
**User goal:** Confirm or back out with full understanding of consequences.
**Layout:** Clear explanation of what is deleted (profile, videos, history) and that it cannot be undone, explicit confirmation control (e.g. type-to-confirm or a held-press, not a single accidental tap), Cancel and Confirm actions.
**Components:** Warning text, confirmation input/control, Cancel (primary-styled, to bias against accidental deletion) and Confirm Delete (destructive-styled) buttons.
**Navigation:** Confirm → deletion requested ([05-api.md](./05-api.md) `DELETE /players/me`) → signed out → Onboarding. Cancel → back to Profile & Settings.
**States:** Default, confirming (submitting), error.
**Errors:** API failure — clear retry, account is not left in an ambiguous partially-deleted state from the player's perspective (the underlying deletion is designed to be safe to retry — see [11-security.md](./11-security.md)).
**Loading:** Submit button spinner; screen is non-dismissible while the request is in flight to avoid a double-submit.
**Empty states:** N/A.
**Accessibility:** Confirmation control must not rely on a gesture alone that's inaccessible to assistive tech (e.g. pair a held-press with an accessible alternative confirm action).
**Mobile behaviour:** Standard.
