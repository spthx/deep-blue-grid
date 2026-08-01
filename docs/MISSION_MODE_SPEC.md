# MISSION MODE / CORE FOUR SPECIAL MISSIONS

This document is the detailed implementation contract for the original four
authored situations in the Web and Unity editions of DEEP BLUE GRID. The full
fourth game mode, `MISSION`, contains sixteen independently selectable missions;
the additional twelve and the library-wide contract are defined in
`MISSION_LIBRARY_SPEC.md`.

CASUAL and TACTICS retain their existing six-sector campaign. SURVIVAL retains
its separate four-operation route and persistent-loss rules. MISSION does not
change or reuse either route's progress, fleet state, arsenal state, loss tempo,
or result calculations.

## Design intent

- Each mission asks one sharply defined tactical question instead of requiring
  the destruction of every hostile ship.
- Friendly and hostile orders of battle, deployments, initial damage, public
  intelligence, initiative, and AI seed are authored and repeatable.
- Severe force asymmetry is allowed, but every mission has a deterministic,
  fair-information solution within its order limit.
- MISSION uses TACTICS information rules: hostile identity, orientation,
  remaining durability, and intact cells stay concealed unless the existing
  public rules reveal them.
- The AI never receives hidden board data. Authored asymmetry must be stated in
  the brief and represented as public state, not as an invisible AI advantage.
- A retry is a chance to refine a solution. It must recreate the exact same
  situation rather than rerolling an easier board.
- The mode reuses the canonical ships, weapon patterns, support links,
  four-direction ECHO, important sections, and 2x2 PASSIVE SONAR. Scenario-only
  restrictions must never alter those rules in another mode.

## Coordinate and direction contract

Player-facing coordinates use row letter then one-based column: `A-1` through
`H-8`. Source coordinates remain zero-based `{ x, y }`, where `A-1` is
`{ x: 0, y: 0 }`.

`East` and `West` occupy cells from the authored start coordinate toward the
right in the board model; the orientation changes the important-section end and
the rendered bow. Likewise, `North` and `South` share the same vertical
footprint but reverse the important section and bow. Every table below lists
the complete player-facing footprint, so the scenario is not dependent on an
ambiguous interpretation of its start coordinate.

Initial `HIT`, `MISS`, `ECHO`, wake, and identification records are scenario
history. They are visible at mission start but do not increment the current
attempt's orders, shots, hits, special-system uses, damage, or accuracy.

## Shared MISSION rules

| Rule | Contract |
| --- | --- |
| Information | TACTICS concealment and important-section identification |
| Deployment | Authored and locked; no random, clear, rotate, drag, or placement-confirm controls |
| Arsenal | A fresh canonical arsenal per attempt; `allowedWeapons` only filters the scenario's selectable systems |
| Damage carryover | None between missions |
| Initiative | Authored per mission; it is independent from concealment rules |
| AI knowledge | Only MISS, ECHO, HIT, SUNK, declared identification, sonar result, and wake observations |
| AI seed | Fixed per mission and preserved by retry |
| Victory | The authored objective, not `enemy.allSunk` |
| Defeat | Authored protected-force/order-limit failure or global friendly combat-capability loss |
| Completion | A successful final order ends immediately; no post-success hostile response |

The canonical route order is:

| No. | English title | Japanese role | Tactical question |
| ---: | --- | --- | --- |
| 1 | NARROW GATE | 狭水道邀撃 | Can prior damage and wake geometry isolate two passing contacts in three orders? |
| 2 | SILENT WATCH | 静粛監視 | Can the required CONTACT and NO CONTACT reports be obtained without firing? |
| 3 | LAST FLIGHT | 最終出撃 | Can an identified important section reduce a battleship to two orientation hypotheses? |
| 4 | BROKEN SPEAR | 残存戦力 | Can a two-ship fire-control link place exactly three area salvos on the hostile carrier? |

All four missions are independent engagements. Advancing to another mission
creates a fresh fleet and arsenal. No ship sunk in one MISSION is removed from
another MISSION.

## MISSION 01 — NARROW GATE / 狭水道邀撃

### Player-facing brief

- **SITUATION / 状況** — 敵主力の陰で駆逐艦と潜水艦が狭水道通過を企図している。
- **OBJECTIVE / 任務目標** — 既知損傷と音紋を利用し、敵駆逐艦・潜水艦を3行動以内に撃沈せよ。
- **INTELLIGENCE / 既知情報** — DD重要区画 `C-4` に既命中。音紋 `E-5` / `E-7` を記録。`D-6` は既知空所。
- **CONSTRAINTS / 制約** — 敵戦艦と護衛艦は任務対象外。両艦が残存しても成功とする。

### Scenario data

| Field | Value |
| --- | --- |
| Friendly force | CA, DD |
| Hostile force | BB, DD, DE-01, SS |
| Initiative | Friendly |
| Allowed weapons | FIRE, 8-INCH STRADDLE, MK-45 II |
| Order limit | 3 friendly actions |
| Targets | Hostile DD and SS |
| Protected ships | None beyond the global requirement that a friendly unit remain capable of acting |
| Fixed seed | `0x4D0101` |
| Effective AI skill / hunt breadth | `1.56 / 3` |

#### Friendly deployment

| Ship | Source start | Orientation | Complete footprint | Initial damage |
| --- | --- | --- | --- | --- |
| CA | `{ x: 1, y: 6 }` | East | `G-2`–`G-5` | None |
| DD | `{ x: 5, y: 7 }` | West | `H-6`–`H-8` | None |

#### Hostile deployment

| Ship | Source start | Orientation | Complete footprint | Initial state |
| --- | --- | --- | --- | --- |
| BB | `{ x: 0, y: 0 }` | East | `A-1`–`A-5` | Intact, concealed |
| DD | `{ x: 2, y: 2 }` | East | `C-3`–`C-5` | `C-4` HIT, important section identified |
| DE-01 | `{ x: 0, y: 7 }` | East | `H-1`–`H-2` | Intact, concealed |
| SS | `{ x: 5, y: 5 }` | East | `F-6` | Intact, concealed |

Public setup records are `D-6 = MISS`, wakes at `E-5` and `E-7`, and DD
identified at `C-4`. The two wakes constrain the SS to `D-6`, `E-6`, or
`F-6`; the historical MISS removes `D-6`. A shot at `E-6` therefore produces
ECHO and proves `F-6` without disclosing it in advance.

### Outcome text

- Success header: `INTERCEPTION COMPLETE`
- Success report: `通過対象2隻の戦闘能力喪失を確認。残存敵主力との交戦を打ち切る。`
- Order-limit failure: `INTERCEPTION WINDOW CLOSED`
- Failure report: `阻止限界時刻を超過。対象艦の海域離脱を確認。`

## MISSION 02 — SILENT WATCH / 静粛監視

### Player-facing brief

- **SITUATION / 状況** — 優勢な敵艦群が監視海域を通過中。発砲は観測任務を損なう。
- **OBJECTIVE / 任務目標** — ALPHAでCONTACT、BRAVOでNO CONTACTを記録し、2行動で離脱せよ。
- **INTELLIGENCE / 既知情報** — ALPHAは `C-3` を左上とする2x2、BRAVOは `F-1` を左上とする2x2聴音区画。
- **CONSTRAINTS / 制約** — 射撃禁止。PASSIVE SONARのみ。潜水艦生存を要する。

`NO CONTACT` means no unbroken hostile section was detected in that 2x2 at
that time. It must not be described as permanent proof that an entire route is
safe.

### Scenario data

| Field | Value |
| --- | --- |
| Friendly force | DE-01, SS |
| Hostile force | BB, CA, DD, DE-01, SS |
| Initiative | Hostile |
| Allowed weapons | PASSIVE SONAR only |
| Order limit | 2 listening actions |
| Required reports | `ALPHA / C-3 = CONTACT`; `BRAVO / F-1 = NO CONTACT`, any order |
| Protected ship | Friendly SS |
| Fixed seed | `0x4D0202` |
| Effective AI skill / hunt breadth | `1.70 / 4` |

#### Friendly deployment

| Ship | Source start | Orientation | Complete footprint | Initial damage |
| --- | --- | --- | --- | --- |
| DE-01 | `{ x: 0, y: 0 }` | East | `A-1`–`A-2` | None |
| SS | `{ x: 7, y: 7 }` | East | `H-8` | None |

#### Hostile deployment

| Ship | Source start | Orientation | Complete footprint |
| --- | --- | --- | --- |
| BB | `{ x: 0, y: 7 }` | East | `H-1`–`H-5` |
| CA | `{ x: 2, y: 3 }` | East | `D-3`–`D-6` |
| DD | `{ x: 5, y: 0 }` | East | `A-6`–`A-8` |
| DE-01 | `{ x: 4, y: 5 }` | East | `F-5`–`F-6` |
| SS | `{ x: 2, y: 1 }` | East | `B-3` |

ALPHA covers `C-3`, `C-4`, `D-3`, and `D-4`; the final two are live CA
sections, so it returns CONTACT. BRAVO covers `F-1`, `F-2`, `G-1`, and
`G-2`; all four are clear, so it returns NO CONTACT.

Only the two designated sonar origins are valid selections. Blocking other
origins prevents an accidental tap from making the authored report impossible.

### Outcome text

- Success header: `ACOUSTIC PICTURE ESTABLISHED`
- Success report: `敵影1件、反応なし1件を記録。観測資料を送信し離脱する。`
- Report failure: `SONAR REPORT INCOMPLETE`
- Report failure body: `聴音回数を消費。所要の二種報告を確立できず。`
- SS loss header: `LISTENING POST LOST`
- SS loss body: `聴音艦との連絡途絶。任務継続不能。`

## MISSION 03 — LAST FLIGHT / 最終出撃

### Player-facing brief

- **SITUATION / 状況** — 先行部隊の一弾が敵BB重要区画 `D-4` へ命中。艦首方位は未確定。
- **OBJECTIVE / 任務目標** — 識別済み重要区画から二つの配置仮説を切り分け、2行動以内に敵戦艦を撃沈せよ。
- **INTELLIGENCE / 既知情報** — BBは中央重要区画のみ既知。水平なら残存区画は `D-2`, `D-3`, `D-5`, `D-6`、垂直なら `B-4`, `C-4`, `E-4`, `F-4`。
- **CONSTRAINTS / 制約** — 空母生存を要する。開始時の護衛リンクによりF-4 PHANTOMは2回出撃可能。

### Scenario data

| Field | Value |
| --- | --- |
| Friendly force | CV, DE-01 |
| Hostile force | BB, CA, DD, SS |
| Initiative | Hostile |
| Allowed weapons | FIRE, F-4 PHANTOM |
| Order limit | 2 friendly actions |
| Target | Hostile BB |
| Protected ship | Friendly CV |
| Required initial link | Escort support to carrier |
| Fixed seed | `0x4D0303` |
| Effective AI skill / hunt breadth | `1.785 / 2` |

#### Friendly deployment

| Ship | Source start | Orientation | Complete footprint | Initial damage |
| --- | --- | --- | --- | --- |
| CV | `{ x: 1, y: 5 }` | East | `F-2`–`F-5`, `G-2`–`G-5` | `G-2`, `G-5` HIT |
| DE-01 | `{ x: 1, y: 4 }` | East | `E-2`–`E-3` | None |

Both DE cells are orthogonally adjacent to CV cells, so
`ESCORT SUPPORT = ACTIVE` and PHANTOM maximum use is 2. If the escort is lost
before the second sortie, the canonical dynamic link rule applies; the mission
does not grant a hidden replacement sortie.

#### Hostile deployment

| Ship | Source start | Orientation | Complete footprint | Initial state |
| --- | --- | --- | --- | --- |
| BB | `{ x: 1, y: 3 }` | East | `D-2`–`D-6` | `D-4` HIT, important section identified |
| CA | `{ x: 0, y: 0 }` | East | `A-1`–`A-4` | Intact, concealed |
| DD | `{ x: 4, y: 7 }` | East | `H-5`–`H-7` | Intact, concealed |
| SS | `{ x: 7, y: 1 }` | East | `B-8` | Intact, concealed |

### Outcome text

- Success header: `TARGET NEUTRALIZED`
- Success report: `敵戦艦の戦闘能力喪失を確認。航空隊収容へ移行。`
- CV loss header: `FLIGHT CONTROL LOST`
- CV loss body: `航空運用母艦の戦闘能力喪失。任務中止。`
- Order-limit header: `SORTIE WINDOW CLOSED`
- Order-limit body: `攻撃可能時間を超過。敵主力は射程外へ離脱。`

## MISSION 04 — BROKEN SPEAR / 残存戦力

### Player-facing brief

- **SITUATION / 状況** — 主砲射撃盤を失った戦艦と護衛艦のみが残存。敵空母は2区画損傷している。
- **OBJECTIVE / 任務目標** — 射撃管制リンクを維持し、HARPOON 3斉射以内に敵空母を撃沈せよ。
- **INTELLIGENCE / 既知情報** — CV重要区画 `C-5` と `C-3` に既命中。`A-4 = MISS`, `B-4 = ECHO`, `E-5 = ECHO` は既知空所。
- **CONSTRAINTS / 制約** — HARPOONのみ。BB・DE-01双方の生存を要する。自軍先制。

The three known empty cells reject the West, South, and North carrier
footprints compatible with important section `C-5`; the surviving hypothesis
is the authored East footprint `C-3`–`C-6`, `D-3`–`D-6`.

### Scenario data

| Field | Value |
| --- | --- |
| Friendly force | BB, DE-01 |
| Hostile force | CV, BB, CA, DD, DE-01, SS |
| Initiative | Friendly |
| Allowed weapons | HARPOON only |
| Order limit | 3 friendly actions |
| Target | Hostile CV |
| Protected ships | Friendly BB and DE-01 |
| Required initial link | Fire-control support to battleship |
| Fixed seed | `0x4D0404` |
| Effective AI skill / hunt breadth | `1.819 / 1` |

#### Friendly deployment

| Ship | Source start | Orientation | Complete footprint | Initial damage |
| --- | --- | --- | --- | --- |
| BB | `{ x: 0, y: 6 }` | East | `G-1`–`G-5` | `G-1` HIT |
| DE-01 | `{ x: 0, y: 5 }` | East | `F-1`–`F-2` | None |

Both DE cells are orthogonally adjacent to BB cells, so
`FIRE CONTROL LINK = ACTIVE` and HARPOON maximum use is 3. Loss of either ship
is an immediate authored failure; it must not silently fall back to a two-salvo
version of the mission.

#### Hostile deployment

| Ship | Source start | Orientation | Complete footprint | Initial state |
| --- | --- | --- | --- | --- |
| CV | `{ x: 2, y: 2 }` | East | `C-3`–`C-6`, `D-3`–`D-6` | `C-3`, `C-5` HIT; identified at important section `C-5` |
| BB | `{ x: 0, y: 7 }` | East | `H-1`–`H-5` | Intact, concealed |
| CA | `{ x: 0, y: 5 }` | East | `F-1`–`F-4` | Intact, concealed |
| DD | `{ x: 5, y: 0 }` | East | `A-6`–`A-8` | Intact, concealed |
| DE-01 | `{ x: 6, y: 6 }` | East | `G-7`–`G-8` | Intact, concealed |
| SS | `{ x: 0, y: 0 }` | East | `A-1` | Intact, concealed |

### Outcome text

- Success header: `CARRIER STRIKE COMPLETE`
- Success report: `敵空母の戦闘能力喪失を確認。残存部隊は離脱針路へ移行。`
- DE loss header: `FIRE CONTROL LINK LOST`
- DE loss body: `射撃管制連接喪失。第3射実施不能、任務中止。`
- BB loss header: `LAUNCH PLATFORM LOST`
- BB loss body: `戦艦の戦闘能力喪失。誘導弾射撃不能。`
- Order-limit header: `STRIKE WINDOW CLOSED`
- Order-limit body: `攻撃限界時刻を超過。敵空母の離脱を許す。`

The MISSION-only HARPOON restriction represents the stated main-battery
failure. FIRE remains unlimited and unchanged in CASUAL, TACTICS, SURVIVAL,
and the other missions where it is allowed.

## Outcome evaluation priority

Only a successfully committed FIRE or LISTEN action increments the friendly
order counter. Cancel, board switching, LOG, help, orientation changes, and an
invalid selection do not consume an order.

The state machine must use this order:

1. Validate the selection and weapon availability. Reject without consuming an
   order if invalid.
2. Spend the weapon once and increment the order once.
3. Resolve the entire multi-cell attack or sonar report, including HIT, ECHO,
   identification, SUNK, log, and visual timing.
4. Evaluate the authored objective. If complete, enter the result immediately.
   Do not run Player Review or a hostile response after success.
5. If the objective is incomplete, evaluate protected-ship loss, global
   friendly combat-capability loss, and the order limit.
6. If no terminal outcome exists, enter Player Review and then the hostile
   response when the player confirms.
7. After the hostile action, evaluate protected-ship and global friendly loss
   before returning control.

Success on the final permitted order therefore has priority over the order
limit. A multi-cell salvo is never interrupted halfway because an intermediate
cell appears to satisfy or fail a condition.

## Retry and progression isolation

- `RETRY MISSION` reconstructs both boards from the authored placements.
- It restores initial hits, intelligence marks, wakes, identification, arsenal,
  order count, objective-report state, initiative, AI profile, and the same
  fixed seed.
- Retry never randomizes a placement or seed.
- Retry never imports current SURVIVAL survivors or commits a MISSION loss to
  SURVIVAL.
- Retry never accelerates the SURVIVAL loss pulse.
- Advancing to the next mission starts that mission's authored fleet at its
  authored initial condition, irrespective of the previous result's damage.
- The long CIC log may retain a clearly delimited prior-attempt history for
  analysis, but old entries are read-only history. They must not affect current
  attempt statistics, AI observations, objective state, or AAR calculations.
- Returning to mode selection discards the active MISSION attempt without
  changing Campaign or SURVIVAL progress.

## Terminology contract

The route nouns are deliberately distinct:

| Mode | English route noun | Japanese route noun |
| --- | --- | --- |
| CASUAL / TACTICS | SECTOR | 海域 |
| SURVIVAL | OPERATION | 作戦 |
| MISSION | MISSION | 限定任務 |

Use `FIRE CONTROL / 射撃指揮` for the player's combat phase. Do not label a
normal player turn merely `COMMAND`. Use `ORDERS REMAINING / 指令残数` for
Missions 1, 3, and 4, and `LISTENING / 聴音` for Mission 2.

`COMMAND ASSESSMENT / 指揮所見` remains correct because it denotes the
command-level assessment in the AAR, not a player's turn.

Use `CONTACT` and `NO CONTACT` only for PASSIVE SONAR. Use `IDENTIFIED` for an
important-section identification. Board results may use `SUNK`; narrative and
AAR prose should prefer `戦闘能力喪失` where the result is broader than the
animation.

A target-only success must never say that the hostile fleet was annihilated or
the entire sea area was cleared. Surviving non-objective ships remain in the
result plot and are reported as `NON-OBJECTIVE CONTACTS REMAINING / 非目標敵影`.

## Mobile thumb-lane and layout contract

MISSION removes the normal placement editor. The player receives
`ASSIGNED FORMATION / 配備確認`, can inspect the own plot and brief, and starts
with one primary action.

On phone portrait:

- The primary action occupies one stable bottom-right thumb lane through the
  complete flow: `ACKNOWLEDGE`, `COMMENCE MISSION`, `FIRE` or `LISTEN`,
  `REPORT / NEXT`, and `RETRY MISSION`.
- Its touch target is at least 44 CSS px in both dimensions; 48–56 px is the
  preferred visible height.
- Cancel or Back is immediately to its left. A required primary action must
  never move to the header or to the far opposite edge because its label grows.
- The board, current objective, allowed-system cells, and primary action must
  fit without a small corrective page scroll at the reference phone sizes.
- The full brief may open as a modal, but the live screen always retains a
  one-line objective and orders remaining.
- MISSION does not show CLEAR, RANDOM, ROTATE, PLACE HERE, or other irrelevant
  placement controls.
- Mission 2 draws thin, in-world dashed frames for ALPHA and BRAVO and only
  accepts their legal 2x2 origins. The overlay must not obscure permanent shot
  marks or sonar results.
- Player Review keeps `REPORT / NEXT` in the same thumb lane and does not
  trigger the hostile action until tapped.
- Result actions put `RETRY MISSION` in the primary lane and `MISSION LIST` or
  `WITHDRAW` on the left.

On tablet landscape and desktop, the same controls may use the established
right-side command dock beside the board. The semantic order and primary-action
position must remain stable; no critical action may fall below the browser or
OS toolbar.

Required visual checks are at least:

- 375x667, 390x844, and 402x874 phone portrait;
- 768x1024 tablet portrait and 1024x768 tablet landscape;
- 1280x720, 1366x700, 1920x850, and 1920x1080 desktop.

## MISSION AAR contract

The result heading is `MISSION AFTER ACTION REPORT`. The facts block uses:

- `OBJECTIVE STATUS / 任務目標`
- `ORDERS USED / 指令使用`
- `INITIAL DAMAGE / 開始時損傷`
- `ENGAGEMENT DAMAGE / 交戦中被害`
- `TARGET STATUS / 任務対象`
- `SUPPORT LINK / 支援連接` where applicable
- `ACOUSTIC REPORT / 音響報告` in SILENT WATCH
- `NON-OBJECTIVE CONTACTS REMAINING / 非目標敵影` when applicable
- `COMMAND ASSESSMENT / 指揮所見`

Initial scenario damage is separated from damage incurred during the attempt.
The generic Campaign accuracy formula must not grade SILENT WATCH, which
correctly records zero shots. Mission-specific assessment is objective-led:

| Mission | Highest assessment | Lower successful assessment factors |
| --- | --- | --- |
| NARROW GATE | 2 orders or fewer, no new friendly damage | Third order, new damage, or a friendly loss |
| SILENT WATCH | CONTACT first, both reports, no new damage | Reversed report order, new damage, or DE loss while SS survives |
| LAST FLIGHT | BB destroyed in one sortie, no new damage | Second sortie, new damage, or CV important-section hit |
| BROKEN SPEAR | Correct three-salvo solution, no new damage | New BB/DE damage; either protected ship lost is failure, not a low grade |

Assessment prose states observed facts and decision effects without accusing
the player. For example: `既知重要区画と弾着記録から艦姿勢を限定し、残存火力を任務対象へ集中。`

## Deterministic clearability vectors

These are canonical rule tests, not hints that must be printed in the normal
brief.

### Vector M01-A — direct interception

1. MK-45 II targets `C-3` and `C-5`.
2. The hostile DD is SUNK because `C-4` was already HIT.
3. FIRE targets `F-6`.
4. The hostile SS is SUNK and the mission succeeds in 2 actions.

### Vector M01-B — inferred submarine

1. MK-45 II targets `C-3` and `C-5`; DD is SUNK.
2. FIRE targets `E-6`; result must be ECHO.
3. FIRE targets `F-6`; SS is SUNK.
4. The third and final action succeeds before limit failure is evaluated.

### Vector M02 — acoustic report

After the fixed hostile opening action:

1. LISTEN at `ALPHA / C-3`; result must be CONTACT.
2. After the fixed hostile response, LISTEN at `BRAVO / F-1`; result must be NO CONTACT.
3. Both required reports complete the mission immediately without another
   hostile response.

The reverse scan order must also succeed. A scan outside ALPHA/BRAVO must be
rejected without consuming an action.

### Vector M03-A — correct first hypothesis

After the fixed hostile opening action, F-4 PHANTOM targets `D-2`, `D-3`,
`D-5`, and `D-6`. With `D-4` already HIT, the BB is SUNK in one action and the
mission ends before a hostile response.

### Vector M03-B — eliminate the vertical hypothesis

1. First PHANTOM targets `B-4`, `C-4`, `E-4`, and `F-4`. None may damage the
   target BB.
2. After the fixed hostile response, the escort link and carrier must remain
   capable of a second sortie.
3. Second PHANTOM targets `D-2`, `D-3`, `D-5`, and `D-6`; BB is SUNK on the
   final permitted action.

### Vector M04 — linked three-salvo solution

The target CV starts with `C-3` and `C-5` HIT.

1. HARPOON centered on `B-5` damages target cells `C-4` and `C-6`.
2. HARPOON centered on `C-4` damages target cells `D-3` and `D-5`.
3. HARPOON centered on `C-5` damages target cells `D-4` and `D-6`.
4. All eight CV sections are now HIT/SUNK. The third final action succeeds
   before limit failure and before a hostile response.

The fixed AI seeds must additionally satisfy these survival invariants:

- M01: at least one friendly ship remains capable through the 3-action vector.
- M02: the friendly SS survives until the second report is filed.
- M03: the CV survives the opening action; CV and escort link remain available
  through the second-sortie branch.
- M04: BB and DE-01 remain alive through the third-salvo vector.

## Validation checklist

- Exactly four core MISSION definitions with IDs 1–4 and fixed seeds; the full
  sixteen-definition library is validated separately by `validateMissionLibrary`.
- Every authored footprint is in bounds and non-overlapping on its own board.
- Every initial HIT lies on the declared ship and produces the declared
  identification state.
- Every authored MISS/ECHO matches the fixed hostile placement.
- M03 starts with `hasEscortLink = true` and PHANTOM maximum use 2.
- M04 starts with `hasFireControlLink = true` and HARPOON maximum use 3.
- `allowedWeapons` cannot expose a system whose carrier is absent.
- The canonical clearability vectors pass without inspecting hidden cells.
- Retry recreates identical serialized scenario state and AI decisions.
- Campaign and SURVIVAL stage counts, route labels, persistence, AI values, and
  clearability results are unchanged.
- Target-only success leaves non-objective hostile contacts visible in the
  result plot and uses target-specific result prose.
- The brief, objective, order counter, board, allowed weapons, and primary
  action remain readable and operable at every required viewport.
