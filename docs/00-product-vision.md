# 00 — Product Vision

**Status:** Draft v1 — foundational document, source of truth for all downstream documentation.
**Related documents:** [01-product-requirements.md](./01-product-requirements.md) · [08-coaching-engine.md](./08-coaching-engine.md)

---

## 1. Mission

Give every cricketer access to the kind of specific, honest, high-quality technical feedback that today only a small number of players — those with access to a good coach — ever receive.

## 2. Vision

To become the world's leading AI cricket coaching platform: the default way cricketers at every level observe their game, understand what to work on, and prove they've improved.

This is a long-term vision. **Version 1 does not attempt to build it.** Version 1 builds one exceptional, complete feedback loop and earns the right to expand from there.

## 3. Target Users

**Primary (v1):** Club and school-level batters, roughly ages 12–18, who train regularly (nets, club training) but do not have consistent one-on-one access to a qualified batting coach.

**Secondary (v1, indirect):** Parents and club coaches who want an objective second opinion and a way to track a player's development between coaching sessions.

**Explicitly out of scope for v1:** Elite/professional pathway players (they already have specialist coaching and biomechanics support), bowlers, fielders, wicketkeepers, and adult recreational players as a primary segment (they may use the product, but it is not designed around them yet).

> **Assumption requiring validation:** The 12–18 club/school batter segment is proposed based on where the "no consistent access to expert feedback" problem is most acute and where a mobile-first, self-recorded video product is most viable (players already train in group nets sessions where phone-recording a shot is easy). This should be confirmed against your actual go-to-market intent before it drives design and marketing decisions.

## 4. Initial Target Market

**Australia**, starting with grassroots and junior club cricket. This choice determines:
- Privacy and child-data handling must satisfy Australian Privacy Principles (APPs) and the Australian Privacy Act from day one — see [11-security.md](./11-security.md).
- Cricket season structured coaching cycles (Australian summer season) frame the initial onboarding and drill cadence.
- Local language, currency and cricket terminology defaults (metric units, Australian shot/field terminology) are the v1 defaults.

> **Assumption requiring validation:** Confirm Australia is the intended launch market before any market-specific copy, legal text, or currency defaults are built.

## 5. Core Problem

Improving cricket technique requires three things most players don't reliably get:

1. **Accurate observation** — most players cannot see their own technique; a phone video helps, but raw footage alone doesn't tell you what's wrong.
2. **Correct diagnosis** — technical faults have root causes that aren't always the obvious symptom (e.g. a "closed bat face" is often caused by grip, not the swing itself).
3. **Prioritisation** — even when multiple faults exist, only one is usually worth fixing right now. Most feedback (human or app) either gives no feedback or gives a long list that overwhelms a player and produces no behaviour change.

Layered on top: quality human coaching is expensive, inconsistent between coaches, often subjective, and available infrequently (once a week, if that).

## 6. Core Solution

Cricket AI turns a smartphone video of a player's batting into a single, prioritised, explained, and actionable coaching decision:

> Record → Cricket AI analyses technique → identifies the **one** highest-value issue → explains it in plain language → prescribes a specific drill → player trains → player re-records → Cricket AI measures whether it actually improved.

This is the **OBSERVE → ANALYSE → DIAGNOSE → PRIORITISE → PRESCRIBE → TRAIN → MEASURE → IMPROVE** loop, and it is the entire v1 product. Nothing in v1 exists outside this loop.

## 7. Value Proposition

**"Your personal batting coach, in your pocket — tell me the one thing to fix, show me how, and prove I got better."**

For the player: expert-grade, specific, judgement-free feedback, available every time they train, not once a week.
For the parent/coach: an objective, consistent record of technical development over a season.

## 8. Killer Feature

Not "AI analyses your batting" — every competitor claims that. The killer feature is **prioritised, provable improvement**:

- Cricket AI never presents a wall of detected issues. It picks **one**.
- Every recommendation is traceable: observation → measurement → interpretation → recommendation, with confidence stated honestly (see [06-ai-architecture.md](./06-ai-architecture.md) §5).
- The loop closes: the player's *next* video is compared against their *last* video on the same measurement, so improvement is shown, not asserted.

## 9. Product Philosophy

Cricket AI must feel **premium, fast, simple, intelligent, trustworthy, cricket-specific, personal, and visually impressive.** It must never feel like a generic AI chatbot with cricket vocabulary bolted on.

Practically, this means:
- No feature ships that isn't clearly cricket-specific — every screen should be unmistakably about *this* player's *batting*, not a generic "upload video, get AI feedback" tool.
- The product never overwhelms. One issue, one drill, one next action, always.
- Every AI-generated claim is honest about certainty. See the Coaching Principle in [08-coaching-engine.md](./08-coaching-engine.md).
- Visual and interaction design meets the bar of premium sports-performance products (see [10-design-system.md](./10-design-system.md)), not generic SaaS/chatbot UI.

## 10. Competitive Positioning

| Alternative | Why it falls short |
|---|---|
| Human coaching | Expensive, infrequent, inconsistent quality between coaches, not available on-demand between sessions. |
| Generic sports analysis apps (multi-sport) | Not cricket-specific; treat cricket as one of many sports rather than modelling its actual technique taxonomy. |
| YouTube / generic content | Generic advice, not personalised to *this* player's *this* video; no measurement of whether it worked. |
| Existing cricket analysis tools (broadcast-grade CV) | Built for professional/broadcast use, not accessible or affordable to a club player; often measure everything and explain nothing. |

Cricket AI's position: **the only product that is simultaneously cricket-specific, personalised to the individual player, and closes the loop with measured improvement — at a price and accessibility level a club player can actually use.**

## 11. Long-Term Product Vision

Beyond v1, in roughly the order the architecture is designed to support (see [03-system-architecture.md](./03-system-architecture.md) §12 for scaling notes):

1. Expand technique analysis across all batting shot types, then to bowling, fielding, and wicketkeeping.
2. Match intelligence — situational decision-making, not just technique.
3. Personalised coaching models that adapt to an individual player's history, body, and goals.
4. Coach and academy dashboards — allow a human coach to oversee a squad of players using Cricket AI as their measurement layer, not a replacement.
5. Team and match analysis.
6. Professional-grade performance analysis for representative and elite pathways.

None of this is built in v1. The v1 architecture must not *block* this future, but must not attempt to pre-build it either.
