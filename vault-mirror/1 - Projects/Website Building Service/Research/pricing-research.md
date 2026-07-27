# Full-line pricing research (2026-07-26)

Proposed name: Firstcall (not yet confirmed by owner). Real sourced research across all 4 service lines + bundle strategy. Full agent output archived in council session log; this file holds the final numbers and key caveats.

## Recommended pricing

| Service | Price | Type |
|---|---|---|
| Website build | $999 | One-time |
| Website upkeep | $79/mo | Recurring |
| Advertising/video ads | $699/mo service fee (ad spend billed separately, client-funded, $300-600/mo minimum recommended) | Recurring |
| Phone-answering | $129/mo (~300 min included), $0.40/min overage | Recurring |
| Growth bundle (local SEO + GBP management + basic social posting) | $399/mo | Recurring |
| **All 4 recurring services bundled** | **~$999/mo** (vs $1,306/mo a la carte, ~25% bundle discount) | Recurring |

## Phone-answering real cost stack (most rigorously sourced number)
- Twilio number: $1.15/mo flat
- Twilio inbound call: $0.0085/min
- Twilio ConversationRelay (STT+TTS): $0.07/min
- LLM inference: ~$0.01-0.03/min (estimated, not directly sourced)
- **Total: ~$0.10/min building on raw Twilio primitives** vs ~$0.15-0.30/min buying an off-the-shelf platform (Vapi, Synthflow, Bland.ai)
- At $129/mo for 300 min: ~76% gross margin building custom vs ~53% buying a wrapper platform

## Bundle strategy: hybrid, transparent pricing
Real incumbents (Thryv, Hibu, ServiceTitan) converge on hybrid: sell single services standalone AND offer a bundle discount for 3+ services. The key differentiator to copy: **publish real prices**, don't gate behind a sales call (Hibu/LOCALiQ do this and it doesn't scale to high lead volume). The key failure mode to avoid: hidden fees that inflate the real price over time (Podium's $399 routinely runs $600+; Hibu's $1,500 runs $2,300+; Birdeye's $299 runs $4,000-6,000/yr with setup fees).

## Honest open questions (from the research)
1. No real call-volume/duration data for these specific trade types (fencing, drywall, upholstery, pet grooming) — the 300 min/mo assumption is inferred from competitor tier sizing, should be validated with actual prospects.
2. The $0.01-0.03/min LLM inference cost is a derived estimate, not directly sourced — the single most important number to pressure-test with a real pilot.
3. Smith.ai pricing has an unresolved discrepancy between their own page (human-staffed, $300+/mo) and third-party claims of a cheaper AI-only tier.
4. No real financials for the 5 actual named prospects — all revenue figures used for budget-fit sanity-checking are industry averages, not their real numbers.
