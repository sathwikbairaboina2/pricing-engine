# ADR 0003: Rules start from a fresh base price, and band beats step limit beats price ending

Status: accepted, 2026-10-04

## Context

The design applies the rules, then the step limit, a clamp, rounding and a final re-clamp. Writing the property tests exposed two problems:

1. If the rules start from the current price, `adjustBps` compounds. A "+8% when stock is low" rule would add another 8% on every recompute while stock stays low.
2. The limits can conflict:
   - when cost jumps, the new floor can sit far above the previous price plus `maxStepBps`;
   - a price ending such as `.99` may not exist inside a narrow interval.

   "Never below the floor" and "never more than one step" cannot both hold in those cases.

## Decision

- Each evaluation starts from `base = cost + defaultMarkupBps`, computed fresh from the inputs. The previous price is used only for the step limit. The price is then a function of the inputs, the rule set, the previous price and `now`.
- Precedence is fixed: **band (floor, ceiling) > step limit > price ending.**
  - The allowed interval is `band ∩ stepBand`. If the two do not intersect, it is the band alone, and the trace records that.
  - The price ending picks the nearest candidate inside the allowed interval; a tie goes to the lower price. If no candidate exists, the ending is skipped, and the trace records that.
- If rounding makes the ceiling fall below the floor, the ceiling is raised to the floor. The floor protects margin, so it wins.
- An active override replaces the rule result. It bypasses the step limit, never the band.
- The property tests state these conditions exactly:
  - the bounds always hold;
  - the step limit holds whenever the step band meets the band;
  - the ending holds whenever the interval contains a candidate.

## Consequences

- What we gave up: a "momentum" pricing style where each recompute nudges from the current price. It can come back later as an explicit rule type.
- With a step limit, a large target change is reached over several recomputes, and each recompute needs a new input version (ADR 0004). A price can stay short of its target until the next input arrives. The docs say this openly.
