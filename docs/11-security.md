# 11 — Security & Privacy

**Status:** Draft v1 — **engineering baseline only. Sections 9–11 require actual legal review before launch; nothing here should be treated as a compliance sign-off.**
**Depends on:** [03-system-architecture.md](./03-system-architecture.md), [04-database.md](./04-database.md)
**Feeds into:** [02-software-requirements.md](./02-software-requirements.md) (NFR-03), [12-testing.md](./12-testing.md) §7

## 1. Authentication

- Supabase Auth: email/password + Apple/Google OAuth (SR-AUTH-001/002).
- Passwords: minimum strength enforced server-side (Supabase Auth policy), never logged, never handled by Coordinator API code (auth flows go client → Supabase directly; the Coordinator API only ever sees the resulting JWT).
- Sessions: short-lived access tokens (≤ 1hr), refresh tokens revocable (SR-AUTH-003). Password change or suspected compromise revokes all outstanding sessions.
- Apple Sign-In offered wherever Google Sign-In is offered (App Store requirement, not just good practice).

## 2. Authorisation

Two layers, deliberately redundant (defence in depth):
1. **Postgres Row-Level Security** ([04-database.md](./04-database.md) §5) — the primary, enforced-at-the-database boundary. A compromised or buggy application-layer check cannot leak another player's data because RLS still blocks it.
2. **Coordinator API checks** — verifies the caller owns the resource (`videoId`, etc.) before acting, as a second line, and because the service-role connection it uses to write pipeline results *does* bypass RLS (§3 of [03-system-architecture.md](./03-system-architecture.md)) and so must not be treated as implicitly safe.

No endpoint trusts a client-supplied player/user ID for authorisation — identity always comes from the verified JWT.

## 3. Data Protection

- All data in transit: TLS everywhere (client ↔ Supabase, client ↔ Coordinator API, Coordinator API ↔ CV microservice, Coordinator API ↔ Claude API) — no exceptions, including internal service-to-service calls.
- All data at rest: Supabase-managed encryption at rest for Postgres and Storage (provider default); no additional application-layer encryption of video files in v1 (re-evaluate if/when handling more sensitive data classes).
- Personal data minimisation: only the profile fields actually needed for the product (SR-PROF-001) are collected — no speculative data collection "for later."

## 4. Video Privacy

Video of a player (frequently a minor — §9) is the most sensitive data class in the product.

- Private by default, always — no public video URLs; all access via short-lived signed URLs scoped to the owning player (§6 of [03-system-architecture.md](./03-system-architecture.md)).
- No video is used for any purpose beyond the owning player's own analysis pipeline in v1 — specifically, **no video or derived data is used to train or fine-tune any model** without separate, explicit, informed consent that does not yet exist in the product. This must be a deliberate, later product decision, never a silent default.
- No video is shared with any third party beyond the processing vendors strictly required to run the pipeline (Anthropic, for the text-only structured explanation calls — video itself is never sent to Claude, per [06-ai-architecture.md](./06-ai-architecture.md) §3).
- Video access is logged (who/when) at the Storage layer sufficiently to support an access audit if ever required.

## 5. Secure Storage

- Object storage (Supabase Storage) buckets are private (§6 of [03-system-architecture.md](./03-system-architecture.md)); no bucket is ever made public.
- Signed URLs: short expiry (upload URLs and playback URLs both time-limited), scoped to a single object, generated server-side only (client never has the ability to mint its own signed URL for another object).

## 6. API Security

- Every Coordinator API endpoint (except none — all require auth, [05-api.md](./05-api.md) §0) verifies the bearer JWT against Supabase's JWKS.
- Input validation on every endpoint (types, enums, ownership) before any database or downstream service call — see per-endpoint validation rules in [05-api.md](./05-api.md).
- CORS restricted to known app origins (mobile app doesn't need browser CORS in the same way, but the staging/admin surfaces do — configured narrowly, not `*`).
- No endpoint returns more data than the authenticated caller is entitled to see — response shapes in [05-api.md](./05-api.md) are scoped per-endpoint, not generic "return the whole row."

## 7. Rate Limiting

Enforced at the Coordinator API (see [05-api.md](./05-api.md) §3): submission endpoints are the tightest-bounded (10/hour for new videos, 5/hour for retries) since each submission has a real processing cost (NFR-08) and is the most plausible abuse vector (e.g. scripted spam submissions). General read endpoints are generously bounded (120/min) since they're cheap and legitimate polling shouldn't be penalised.

## 8. Secrets Management

- No secret (Claude API key, Supabase service-role key, signing keys) is ever present in the mobile app bundle or any client-side code — they exist only in the Coordinator API's and CV microservice's server environments.
- Secrets are injected via the deployment platform's environment/secret manager (not committed to the repository in any form, including `.env` files with real values — only `.env.example` with placeholder keys is committed).
- Secret rotation: API keys are rotatable without a code deploy (read from environment at process start, not hardcoded); rotation procedure and cadence to be defined operationally before launch.
- The Supabase service-role key (which bypasses RLS) is the single highest-value secret in the system and is scoped only to the Coordinator API's backend process — never distributed to any other service or environment casually.

## 9. Child-User Considerations

The primary target segment ([00-product-vision.md](./00-product-vision.md) §3) includes minors (ages 12–18). **This section states engineering defaults; the actual consent mechanism, required legal notices, and any parental-consent workflow must be confirmed with legal review before launch — do not treat the defaults below as sufficient compliance on their own.**

Engineering defaults implemented regardless:
- Under-18 accounts (`is_minor` derived from `age_band`, SR-AUTH-004) default to the most private settings available and have no sharing/social surface exposed in v1 (which has none anyway — see [01-product-requirements.md](./01-product-requirements.md) §8).
- No behavioural advertising, no ad tracking SDKs, no sale/sharing of minor data with third parties for marketing purposes.
- Data collection is limited to what's functionally necessary (§3) — no collection of additional personal data from minors "for engagement" purposes.
- Video and personal data deletion (SR-DATA-001) is available and straightforward, which matters especially for a minor or their parent wanting to exit the product.

**Open question for legal review:** whether a parental-consent capture step is required before a minor's account can submit video, and if so, what mechanism satisfies that requirement in the target market. No such mechanism is built in v1 pending that review.

## 10. Australian Privacy Requirements

Given the initial target market ([00-product-vision.md](./00-product-vision.md) §4), the Australian Privacy Principles (APPs) under the Privacy Act are the baseline compliance target. Engineering-relevant implications already reflected in this architecture:
- **Data minimisation and purpose limitation** (§3): only necessary data is collected, for the stated purpose.
- **Access and correction:** a player can view and edit their own profile data (SR-PROF-001) and their full history (SR-HIST-001) directly.
- **Deletion:** SR-DATA-001 provides a genuine, complete deletion path, not a soft-delete/deactivation.
- **Notification of data breach:** an operational (not engineering-architecture) obligation under Australia's Notifiable Data Breaches scheme — needs an incident-response process defined before launch, out of scope for this document.
- **Cross-border storage:** Supabase and Anthropic infrastructure locations need to be checked against APP 8 (cross-border disclosure) requirements before launch — **flagged as an open item, not resolved by this document.**

A privacy policy reflecting actual data practices (this document plus §11) must be drafted and legally reviewed before public launch — no such policy exists yet.

## 11. International Privacy Considerations

Not the v1 launch market, but the architecture avoids decisions that would make later compliance harder:
- Data-subject rights already supported by design (access, correction, deletion — as above) align with GDPR's core rights even though the EU is not a v1 market.
- No dark-pattern consent flows, no pre-ticked marketing opt-ins.
- If the product later expands to markets requiring a formal consent-management platform (e.g. EU cookie/tracking consent for the marketing site, or COPPA-specific mechanisms for a US under-13 audience), that is new legal and engineering work, not something silently already solved by the current architecture — **explicitly not built or assumed in v1.**
