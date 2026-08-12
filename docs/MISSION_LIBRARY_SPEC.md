# MISSION LIBRARY / 限定任務ライブラリ

This document is the catalog and data contract for the freely selectable
MISSION library. It extends, rather than replaces, the detailed four-mission
contract in `MISSION_MODE_SPEC.md`.

## Library shape

- `standard`: sixteen independent tactical problems, all available from the
  mission-select screen.
- `archive`: five independent log-analysis problems, displayed in a separate
  `ARCHIVE OPERATIONS / 戦闘記録解析` section.
- `extreme`: seven independent, public-information-only end-game problems,
  displayed in `EXTREME OPERATIONS / 極限任務`.
- Mission IDs are stable identifiers. Existing missions retain IDs 1 through
  4; display order is determined by `sortOrder`, never by ID.
- `MISSION_LIBRARY` is the playable twenty-eight-mission route used by index-based
  launch code. `missionLibraryFor(category)` provides category-filtered views.
- No mission is progression-locked. Completion and record state are stored per
  mission ID and never affect Campaign or Survival state.
- Retry reconstructs the authored placement, damage, intelligence, magazine,
  initiative, and fixed seed.

## Record contract

Each mission keeps two values:

1. `bestOrders`: the fewest committed friendly actions in a successful run.
2. `bestTimeMs`: the shortest elapsed time among successful runs with that
   same `bestOrders` value.

Comparison is lexicographic: fewer orders always outrank a faster but longer
solution. Cancel, board switching, LOG, help, and invalid selections consume
neither an order nor a record action. A retry begins a new timer. Initial
scenario damage and historical shots do not count as attempt statistics.

EXTREME operations preserve a no-hidden-information contract across retries.
On defeat, `POST-ENGAGEMENT REVIEW` shows the own-force damage plot, CIC log,
and only the hostile marks, identifications, sonar reports, and plotted contacts
already disclosed during the attempt. Unobserved fixed hostile positions remain
withheld; completing the operation is the only way to earn its clear record.

## Definition fields

| Field | Meaning |
| --- | --- |
| `sortOrder` | Stable category-local display order |
| `difficulty` | Integer 1–6 used for the visible challenge rating |
| `category` | `standard`, `archive`, or `extreme` |
| `enemyDisclosure` | Known hull IDs, unknown-contact count, optional callsigns and candidate cells, plus a concise public summary |
| `archiveLog` | Authored `HHMMZ` entries shown verbatim in archive missions |
| `initialArsenal` | Raw special-weapon magazine counters restored on start/retry |
| `requiredLink` | One required carrier or battleship support link |
| `requiredLinks` | Multiple simultaneously required support links |
| `requiredDestructionOrder` | Target-only sinking order; M11 requires DE before CV |

`initialArsenal` stores raw `Arsenal.uses` counters. Dynamic availability is
still calculated by the canonical formation rule. For example, Archive 02
stores HARPOON counter 2 after one of three linked launches was expended; with
the escort gone, the local authorization ceiling is 2, so one launch remains.

## Objective kinds

| Kind | Completion condition |
| --- | --- |
| `destroy-targets` | Every target is sunk; optional protected ships and destruction order remain valid |
| `sonar-reports` | Every authored CONTACT/NO CONTACT report is filed and the protected listening ship survives |
| `identify-targets` | Every target appears in the attempt's enemy-identification state; sinking is not required |
| `scan-and-destroy` | Every authored sonar report is filed and every target is sunk |

Evaluation order is always objective success, protected-ship loss, then order
limit. Success on the final permitted order therefore remains valid. M11 must
pass the chronological `enemySunkOrder`; an unordered set of sunk ships is not
sufficient.

## Standard missions

The UI sorts these by authored `sortOrder`. The original twelve retain their
published order; IDs 23–26 append four advanced doctrine exercises without
renumbering existing records.

| Display | ID | Mission | Rating | Distinct tactical question | Canonical minimum |
| ---: | ---: | --- | :---: | --- | ---: |
| 1 | 5 | ECHO CROSS | 1 | Intersect three four-direction ECHO neighborhoods | 1 |
| 2 | 2 | SILENT WATCH | 2 | File one CONTACT and one NO CONTACT without firing | 2 |
| 3 | 6 | RANGING FAN | 2 | Infer a damaged CA posture and rotate one STRADDLE | 1 |
| 4 | 1 | NARROW GATE | 3 | Combine known DD damage, wakes, and ECHO inference | 2 |
| 5 | 7 | CROSSING SHOT | 3 | Place one HARPOON X across two damaged hulls | 1 |
| 6 | 8 | DIVIDED BATTERY | 3 | Assign STRADDLE and MK-45 to the only compatible targets | 2 |
| 7 | 9 | COMMAND SECTION | 3 | Hit an important section to identify rather than sink | 1 |
| 8 | 3 | LAST FLIGHT | 4 | Resolve horizontal/vertical BB hypotheses with at most two sorties | 1 (2-safe) |
| 9 | 10 | SHADOW DIVIDE | 4 | Use NO CONTACT to eliminate one of two SS candidates, then fire | 2 |
| 10 | 11 | CUT THE SCREEN | 4 | Destroy the linked escort before the carrier | 3 |
| 11 | 4 | BROKEN SPEAR | 5 | Cover a damaged carrier with three linked HARPOON patterns | 3 |
| 12 | 12 | DUAL LINK | 5 | Preserve both support links and allocate all five special actions | 5 |
| 13 | 23 | DEAD RECKONING | 3 | Cover two published competing fixes with one simultaneous MK-45 order | 1 |
| 14 | 24 | LAST SCREEN | 4 | Survive the hostile opening and use the remaining CV–DE link for one interception | 1 |
| 15 | 25 | LINE ABREAST | 4 | Align three published last sections under one north-facing STRADDLE | 1 |
| 16 | 26 | CONTROL SWEEP | 5 | Touch four published control-section estimates in one identification sweep | 1 |

### Added canonical vectors

- **ECHO CROSS:** FIRE `E-4`.
- **RANGING FAN:** STRADDLE anchor `F-3`, facing north; it covers `E-2`,
  `E-3`, and the already-hit `E-4`.
- **CROSSING SHOT:** HARPOON center `D-4`; its diagonals finish DD `C-3`
  and DE `E-5`.
- **DIVIDED BATTERY:** north-facing STRADDLE from `C-3` finishes CA
  `B-2`–`B-4`; MK-45 selects DD `G-5` and `G-7`. Either action may be first.
- **COMMAND SECTION:** FIRE `D-4`; the important-section hit identifies CA.
- **SHADOW DIVIDE:** LISTEN from `B-2` and record NO CONTACT, then FIRE
  `F-6`.
- **CUT THE SCREEN:** FIRE `C-5` to sink DE, then HARPOON centers `C-4`
  and `F-5` to finish CV. Reversing DE/CV destruction fails the authored
  order even if both ships are eventually sunk.
- **DUAL LINK:** PHANTOM attacks `A-1`–`A-4`, PHANTOM attacks `D-1`–`D-4`,
  then HARPOON centers `B-4`, `G-7`, and `G-6`.
- **DEAD RECKONING:** MK-45 selects both published fixes, `C-3` and `F-6`,
  in the same order. The live contact is at `C-3`; no hidden choice is needed.
- **LAST SCREEN:** after the authored hostile opening, PHANTOM attacks the
  published BREAKER track at `C-5`, `D-5`, `E-5`, and `F-5`. CV and DE-01
  must both survive the opening and the one friendly order.
- **LINE ABREAST:** north-facing STRADDLE anchored at `E-4` covers the three
  published residual sections `C-4`, `D-4`, and `E-4`.
- **CONTROL SWEEP:** PHANTOM attacks the published important-section estimates
  `C-1`, `C-4`, `C-6`, and `G-8`; all four hostile hulls become identified.

The original canonical vectors for NARROW GATE, SILENT WATCH, LAST FLIGHT, and
BROKEN SPEAR remain defined in `MISSION_MODE_SPEC.md`.

## Archive operations

Archive logs are evidence, not flavor text. The player must be able to reopen
the exact entries during play. On narrow screens each record is one wrapping
line (`HHMMZ  text`); it must not be forced into timestamp/source/body columns.

| ID | Mission | Rating | Inference axis | Unique conclusion | Misread result |
| ---: | --- | :---: | --- | --- | --- |
| 13 | TRACK RECONSTRUCTION | 2 | Hit chronology, important section, orientation | ORPHEUS occupies `D-2`–`D-5`; MK-45 selects `D-2/D-3` | One CA section remains |
| 14 | MAGAZINE ACCOUNT | 3 | Expended launch plus loss of escort authorization | One HARPOON remains; center `B-5` hits CV `C-4/C-6` | Magazine empty with ARGUS active |
| 15 | RELIEF OF WATCH | 4 | Hostile-fire completion and watch transfer | BLUE acts now; FIRE `G-8` before the next hostile window | Threat remains when the one-order window closes |
| 16 | NAMED HULL | 4 | Callsign, five-section hull, course, bow/stern hits | VIGILANT spans `B-6`–`F-6`; east STRADDLE from `D-5` covers `C-6/D-6/E-6` | Non-objective contact struck; named hull remains |
| 27 | PRIORITY SIGNAL | 5 | Last-section fixes plus the latest FLASH priority signal | FIRE `G-2`, `D-5`, then `B-7` to sink PICKET → IRONCLAD → ASCENDANT | A correct set in the wrong order violates the priority signal |

Archive 03 deliberately avoids an RNG-dependent promised enemy hit. Its
one-order deadline represents the publicly logged next hostile firing window;
an incorrect first order fails immediately and deterministically.

## Extreme operations

Extreme operations have no hidden-information exception: every deterministic
victory route is derived from the brief, visible tactical plot, disclosed
contacts, and permitted systems. They do not require completion of another
mission and their records use the same per-mission ID contract.

Authored `candidateCells` are public intelligence, not solution metadata. The
placement brief renders every code and coordinate in `PLOTTED CONTACTS`, also
on compact phones where the longer hostile summary may be collapsed. Required
weapon sequences, exact weapon-use multisets, and ordered sonar reports are
evaluated as victory conditions; merely destroying the target by a shorter or
reversed route does not complete the operation.

| ID | Mission | Rating | Tactical question |
| ---: | --- | :---: | --- |
| 17 | FALSE WAKE | 6 | Correlate two sonar reports, a damaged DD, and one MK-45 window. |
| 18 | SEVERED LINK | 6 | Keep dual support links alive while enforcing an escort → carrier → battleship destruction order. |
| 19 | CROSS BEARING | 6 | Close two damaged contacts with different weapon geometries in two orders. |
| 20 | COMMAND SECTIONS | 6 | Identify three critical sections without sinking the targets. |
| 21 | OPERATION MOBY-DICK | 6 | Contain and sink SSX-02 LEVIATHAN after its disclosed silent egress. |
| 22 | NO SECOND SALVO | 6 | Allocate the last available special salvos across five damaged targets. |
| 28 | SENSOR TO SHOOTER | 6 | File the ordered ALPHA CONTACT, then transfer that fix into one crossing HARPOON salvo. |

`SENSOR TO SHOOTER` listens at ALPHA (`C-3` through `D-4`) first. After the
required CONTACT report, one HARPOON centered at `D-4` crosses the published
DD last section `C-3` and submerged fix `E-5`. Reversing the two systems does
not satisfy the authored sensor-to-shooter sequence.

## Static validation contract

`validateMissionDefinition` checks:

- legal, non-overlapping deployments and complete declared fleets;
- positive stable IDs, category-local sort orders, order limits, AI skill,
  hunt breadth, and fixed seeds, plus duplicate fleet/weapon rejection;
- in-bounds initial hits, without an already-destroyed starting hull;
- truthful MISS/ECHO intelligence under the current four-direction ECHO rule;
- wakes that do not overlap a hostile hull;
- an extant friendly carrier for each allowed special weapon;
- valid initial magazine counters;
- objective and protected hull membership;
- unique, truthful 2x2 sonar origins and report codes;
- valid required-weapon sequences/multisets and ordered-report usage;
- disclosure counts, unique in-bounds plotted contacts, and valid `0000Z`–
  `2359Z` archive timestamps;
- required support-link state.

`validateMissionLibrary` also rejects duplicate IDs and duplicate category-local
sort orders, and prefixes issues with the mission identity. The complete
twenty-eight-definition library must validate
with an empty issue array before build or publication.

Canonical solution vectors remain outside production definitions so they
cannot leak into the player-facing bundle as hints. Tests or simulation scripts
may execute those vectors against the public definitions and pure mission
evaluator.
