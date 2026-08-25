# 10 — Design System

**Status:** Draft v1 — **visual direction proposal, not yet validated with a designer/brand lead. See §0.**
**Depends on:** [00-product-vision.md](./00-product-vision.md) §9 (Product Philosophy), [09-ux-specification.md](./09-ux-specification.md)
**Feeds into:** `/design`

## 0. Direction & Validation

The direction below targets a **premium sports-performance product** (think the visual register of Whoop, Strava, or Nike Training Club) rather than a generic SaaS/chatbot UI — dark-first, confident typography, restrained colour used purposefully (especially for confidence and verdict signals, which carry real coaching meaning and must never be decorative). This is a proposal for a design lead to react to, not a finished brand system — specific font choices in particular should be confirmed for licensing before implementation.

## 1. Colour

Dark mode is the **default/primary** theme; light mode is a fully-specified secondary theme, not an afterthought.

**Base (dark, default):**
| Token | Value | Use |
|---|---|---|
| `color.bg.primary` | `#0B0F0E` | App background |
| `color.bg.surface` | `#151B19` | Cards, sheets |
| `color.bg.surfaceRaised` | `#1E2622` | Elevated elements (modals, active cards) |
| `color.text.primary` | `#F4F6F5` | Primary text |
| `color.text.secondary` | `#9AA6A1` | Secondary/meta text |
| `color.border.default` | `#283330` | Dividers, input borders |

**Base (light, secondary theme):**
| Token | Value |
|---|---|
| `color.bg.primary` | `#F7F9F7` |
| `color.bg.surface` | `#FFFFFF` |
| `color.bg.surfaceRaised` | `#FFFFFF` (with elevation shadow) |
| `color.text.primary` | `#101513` |
| `color.text.secondary` | `#5B655F` |
| `color.border.default` | `#DDE3E0` |

**Brand accent:**
| Token | Value | Use |
|---|---|---|
| `color.accent.primary` | `#3DDC84` ("Willow") | Primary CTAs, active states, brand moments |
| `color.accent.primaryPressed` | `#2FBE6E` | Pressed/active state of primary accent |

**Semantic (same meaning, both themes — used for confidence and verdict signals, never decorative):**
| Token | Value | Use |
|---|---|---|
| `color.semantic.improved` | `#3DDC84` | `improved` verdict, `high` confidence |
| `color.semantic.neutral` | `#E8B93D` | `no_material_change`, `medium` confidence |
| `color.semantic.caution` | `#E8B93D` | `low` confidence label |
| `color.semantic.regressed` | `#E2574C` | `regressed` verdict |
| `color.semantic.info` | `#4EA1E8` | informational states |

**Rule:** confidence and verdict must always pair colour with a text label (per accessibility notes throughout [09-ux-specification.md](./09-ux-specification.md)) — colour reinforces, never solely conveys, meaning that affects how a player trusts the diagnosis.

## 2. Typography

**Assumption requiring validation:** exact typeface licensing/availability. Direction:
- **Display/Headline face:** a confident, slightly condensed geometric sans for headlines and stat numbers (e.g. Inter Tight, or a similar condensed grotesk) — used for verdict headlines, measurement values, root-cause names. This is where the product gets its "performance" character.
- **Body/UI face:** Inter (or system font stack as a safe fallback: `-apple-system, Roboto`) for body text, labels, and form fields — optimised for legibility at small sizes on device.

**Scale (mobile, base 16px):**
| Token | Size / Line-height | Use |
|---|---|---|
| `type.display.lg` | 34 / 40 | Verdict headline, key screen titles |
| `type.display.md` | 26 / 32 | Card headlines (root cause name) |
| `type.stat.lg` | 40 / 44, tabular figures | Measurement/comparison numbers |
| `type.body.lg` | 17 / 24 | Primary explanation text |
| `type.body.md` | 15 / 22 | Default body/UI text |
| `type.label.sm` | 13 / 18, uppercase, tracked | Section labels, badges |
| `type.caption` | 12 / 16 | Meta text, timestamps |

## 3. Spacing

4px base grid: `4, 8, 12, 16, 24, 32, 48, 64`. Screen-edge margin default `16`; card internal padding default `16`–`24`.

## 4. Components

### Buttons
- **Primary:** filled `color.accent.primary`, dark text on accent for contrast, full-width on mobile forms, 48px min height (comfortably exceeds 44pt touch target).
- **Secondary:** outline, `color.border.default`, text `color.text.primary`.
- **Destructive:** filled `color.semantic.regressed` (delete account, discard) — reserved exclusively for irreversible/destructive actions so it retains meaning (SR-DATA-001 delete flow).
- **Ghost/tertiary:** text-only, used for low-emphasis actions (e.g. "Retake").
- States: default, pressed (scale 0.97 + opacity), disabled (40% opacity, non-interactive), loading (inline spinner replaces label, button retains size to avoid layout shift).

### Cards
- Base card: `color.bg.surface`, 16px radius, 24px padding, subtle 1px `color.border.default` (dark mode) or soft shadow (light mode).
- Result card (Analysis Results): elevated variant (`surfaceRaised`) to signal it's the primary content on the screen.
- History row: compact card, left-aligned date/meta, right-aligned outcome badge.

### Inputs
- Text field: 48px height, 12px radius, border `color.border.default`, focus state uses `color.accent.primary` border + subtle glow.
- Segmented control (e.g. batting hand): pill-shaped, selected segment filled `color.accent.primary`.
- Select/picker: matches text field styling, chevron affordance.
- Error state: border `color.semantic.regressed`, inline message below field in the same colour, paired with an icon (not colour-only).

### Navigation
- Bottom tab bar, 3 destinations: **Home, History, Profile** — deliberately minimal, matching the single-loop product scope (no room for a 5-tab bar that implies more product than v1 has).
- Header pattern: back chevron + screen title, no unnecessary chrome.

### Charts / Data Visuals
Used sparingly and only where they carry real meaning (measurement-vs-reference-range, before/after comparison) — never decorative:
- **Reference-range bar:** horizontal bar showing the reference range as a neutral band and the measured value as a marker, coloured by in-range (`accent.primary`) vs out-of-range (`semantic.regressed`/`semantic.neutral` by severity). Confidence is shown as a separate, explicit label beside the bar, never encoded as bar opacity/blur (which would be misread as a design choice, not a meaning signal).
- **Before/after comparison:** two reference-range bars stacked, sharing the same scale, with a connecting arrow annotated with the delta value — see the `dataviz` skill guidance if/when this is implemented as code, for accessible colour-by-series and light/dark parity.
- **Verdict badge:** pill component, semantic colour + icon + text label, used consistently across Comparison Result and History.

### Icons
Clean, single-weight line icon set for all UI controls (navigation, actions) — a widely-available icon library (e.g. Phosphor or Lucide) rather than custom-drawn, to keep v1 velocity high. One deliberate cricket-specific motif — a stylised 22-yard pitch/crease line — used sparingly as a recurring brand/background graphic (onboarding, empty states), not as literal icon replacements for generic UI actions (avoids the "cricket vocabulary bolted onto generic UI" trap called out in [00-product-vision.md](./00-product-vision.md) §9).

## 5. Animation Principles

- **Purposeful, not decorative.** Every animation communicates a state change (loading → ready, drill marked complete, verdict revealed) — nothing animates for its own sake.
- **Fast for micro-interactions:** 150–250ms, spring/ease-out easing for button presses, card transitions, tab switches.
- **Earned moments get more:** the `improved` verdict reveal (Comparison Result) is the one place a slightly more celebratory animation (e.g. a brief accent-colour pulse/reveal) is warranted — it's the product's core payoff moment. Reserve this restraint deliberately; overusing celebratory animation elsewhere cheapens it and reads as juvenile rather than premium.
- **Loading states prefer skeletons over spinners** where content shape is known (cards, lists) — spinners are reserved for indeterminate operations (Analysis In Progress stages, which have their own real-stage-label treatment per [09-ux-specification.md](./09-ux-specification.md) §7).

## 6. Dark Mode

Dark is the default theme (§1); light mode is a fully parallel token set, not a quick invert. Both themes are built from the start — no component ships that only exists in one theme. Semantic colours (`improved`/`regressed`/etc.) keep the same values across both themes for consistency of meaning; only background/surface/text tokens change.
