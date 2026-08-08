# MISSION clearability report

Measured: 2026-08-01
Command: `npm run measure:missions -- 10000`

## What the numbers mean

- **Canonical proof** executes a deterministic solution derived only from the mission brief, visible tactical plot, and (for ARCHIVE OPERATIONS) the operation diary. A PASS proves that the production board, magazines, initiative, enemy AI, survival requirements, order limit, and destruction-order rules admit that victory route.
- **Clue-informed model** is not player telemetry. It follows the public-evidence solution with a declared whole-mission comprehension assumption of D1 97%, D2 88%, D3 74%, D4 58%, and D5 43%; when it makes a reasoning/operation error it substitutes a uniformly legal public-information order. The complete game engine then resolves the attempt.
- **Blind baseline** chooses uniformly among available weapons and unresolved public cells/patterns. It never reads hostile placements. This is a control value, not an expected human result.
- The historic table uses 10,000 reproducible seeded attempts per mission and
  rounds to two decimals. The current release screen below uses 100 attempts per
  mission and therefore reports integer wins out of 100.

## Current 22-mission release screen

Measured: 2026-08-08
Command: `npm run measure:missions -- 100`

This 100-attempt-per-mission run is the current release-screening sample. It is
small enough that individual values are integer percentages, so it is evidence
of difficulty ordering and regression health rather than player clear-rate
telemetry. All twenty-two canonical routes passed against the production
evaluator, including ordered sonar reports and exact EXTREME weapon doctrine.

| No. | Mission | D | Canonical | Clue-informed / 100 | Blind / 100 |
|---:|---|:---:|:---:|---:|---:|
| 01 | ECHO CROSS | 1 | PASS | 97 | 0 |
| 02 | SILENT WATCH | 2 | PASS | 85 | 0 |
| 03 | RANGING FAN | 2 | PASS | 89 | 6 |
| 04 | NARROW GATE | 3 | PASS | 75 | 0 |
| 05 | CROSSING SHOT | 3 | PASS | 72 | 0 |
| 06 | DIVIDED BATTERY | 3 | PASS | 71 | 0 |
| 07 | COMMAND SECTION | 3 | PASS | 74 | 0 |
| 08 | LAST FLIGHT | 4 | PASS | 82 | 0 |
| 09 | SHADOW DIVIDE | 4 | PASS | 60 | 0 |
| 10 | CUT THE SCREEN | 4 | PASS | 64 | 0 |
| 11 | BROKEN SPEAR | 5 | PASS | 41 | 0 |
| 12 | DUAL LINK | 5 | PASS | 34 | 0 |
| 13 | TRACK RECONSTRUCTION | 2 | PASS | 85 | 1 |
| 14 | MAGAZINE ACCOUNT | 3 | PASS | 73 | 4 |
| 15 | RELIEF OF WATCH | 4 | PASS | 55 | 3 |
| 16 | NAMED HULL | 4 | PASS | 56 | 0 |
| 17 | FALSE WAKE | 6 | PASS | 31 | 0 |
| 18 | SEVERED LINK | 6 | PASS | 36 | 0 |
| 19 | CROSS BEARING | 6 | PASS | 30 | 0 |
| 20 | COMMAND SECTIONS | 6 | PASS | 38 | 0 |
| 21 | OPERATION MOBY-DICK | 6 | PASS | 42 | 4 |
| 22 | NO SECOND SALVO | 6 | PASS | 33 | 0 |

Difficulty aggregates for the clue-informed sample are D1 97/100 (97.0%), D2
259/300 (86.3%), D3 365/500 (73.0%), D4 317/500 (63.4%), D5 75/200 (37.5%),
and D6 210/600 (35.0%). The monotonic decline is the intended library shape;
the narrow D5-to-D6 gap reflects that D5 already teaches the linked-fire
doctrine required by the extreme set.

## Historic core-library results (missions 1–16)

This 2026-08-01 stochastic benchmark predates the six extreme missions. It is
retained as a measured baseline for the original tactical/archive library and
must not be interpreted as rates for the current 22-mission catalog. Missions
17–22 are covered by the deterministic canonical-route regression below.

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

`tests/mission-simulation.test.ts` runs all twenty-two canonical routes against the real mission evaluator and fails if any route becomes illegal, exceeds its order limit, loses a protected ship before completion, violates a required destruction order, or does not end in victory.

These modeled rates should be replaced or recalibrated only after opt-in aggregate player telemetry or a sufficiently large observed playtest sample exists.
