# MISSION clearability report

Measured: 2026-08-01
Command: `npm run measure:missions -- 10000`

## What the numbers mean

- **Canonical proof** executes a deterministic solution derived only from the mission brief, visible tactical plot, and (for ARCHIVE OPERATIONS) the operation diary. A PASS proves that the production board, magazines, initiative, enemy AI, survival requirements, order limit, and destruction-order rules admit that victory route.
- **Clue-informed model** is not player telemetry. It follows the public-evidence solution with a declared whole-mission comprehension assumption of D1 97%, D2 88%, D3 74%, D4 58%, and D5 43%; when it makes a reasoning/operation error it substitutes a uniformly legal public-information order. The complete game engine then resolves the attempt.
- **Blind baseline** chooses uniformly among available weapons and unresolved public cells/patterns. It never reads hostile placements. This is a control value, not an expected human result.
- Both stochastic columns use 10,000 reproducible seeded attempts per mission. Values are rounded to two decimal places.

## Results

| No. | Mission | D | Canonical | Best route | Clue-informed | Blind baseline |
|---:|---|:---:|:---:|---:|---:|---:|
| 01 | ECHO CROSS | 1 | PASS | 1 order | 97.04% | 1.66% |
| 02 | SILENT WATCH | 2 | PASS | 2 orders | 88.06% | 0.16% |
| 03 | RANGING FAN | 2 | PASS | 1 order | 88.36% | 3.69% |
| 04 | NARROW GATE | 3 | PASS | 2 orders | 74.91% | 0.10% |
| 05 | CROSSING SHOT | 3 | PASS | 1 order | 74.13% | 1.38% |
| 06 | DIVIDED BATTERY | 3 | PASS | 2 orders | 74.12% | 0.00% |
| 07 | COMMAND SECTION | 3 | PASS | 1 order | 74.18% | 1.57% |
| 08 | LAST FLIGHT | 4 | PASS | 2 orders | 76.24% | 0.00% |
| 09 | SHADOW DIVIDE | 4 | PASS | 2 orders | 58.50% | 0.01% |
| 10 | CUT THE SCREEN | 4 | PASS | 3 orders | 59.65% | 0.00% |
| 11 | BROKEN SPEAR | 5 | PASS | 3 orders | 44.34% | 0.04% |
| 12 | DUAL LINK | 5 | PASS | 5 orders | 43.58% | 0.00% |
| 13 | TRACK RECONSTRUCTION | 2 | PASS | 1 order | 87.71% | 0.08% |
| 14 | MAGAZINE ACCOUNT | 3 | PASS | 1 order | 74.40% | 3.35% |
| 15 | RELIEF OF WATCH | 4 | PASS | 1 order | 58.52% | 1.64% |
| 16 | NAMED HULL | 4 | PASS | 1 order | 58.46% | 1.30% |

`LAST FLIGHT` exceeds the nominal D4 comprehension assumption because an incorrect four-cell sortie can still overlap one of the openly presented candidate axes, allowing recovery on the second sortie. That is an engine-resolved property rather than an adjusted score.

## Regression contract

`tests/mission-simulation.test.ts` runs all sixteen canonical routes against the real mission evaluator and fails if any route becomes illegal, exceeds its order limit, loses a protected ship before completion, violates a required destruction order, or does not end in victory.

These modeled rates should be replaced or recalibrated only after opt-in aggregate player telemetry or a sufficiently large observed playtest sample exists.
