# INITIAL TRAINING / 初任訓練

INITIAL TRAINING is the mandatory entry point for a new progression record. It
contains nine deterministic lessons. Only the first lesson is initially
available; clearing a lesson authorizes the next one, while completed lessons
remain replayable. Clearing all nine authorizes CASUAL. Training never changes
MISSION records, campaign state, or SURVIVAL fleet state.

| Display | Stable lesson ID | Stage ID | Title | Focus |
| ---: | ---: | ---: | --- | --- |
| 01 | 7 | 107 | FLEET DEPLOYMENT | Drag, rotate, lock, and commence |
| 02 | 1 | 101 | TACTICAL PLOT | Coordinate reading and FIRE |
| 03 | 2 | 102 | ACOUSTIC BEARING | Four-direction ECHO correlation |
| 04 | 3 | 103 | CROSS FIX | Hull reconstruction and STRADDLE orientation |
| 05 | 4 | 104 | ESCORT SUPPORT | Carrier escort link and two F-4 sorties |
| 06 | 5 | 105 | FIRE CONTROL LINK | Battleship link and HARPOON allocation |
| 07 | 6 | 106 | SILENT TRACE | Wake, 2×2 PASSIVE SONAR, and contact close |
| 08 | 8 | 108 | DAMAGE REPORT | Hostile impact, persistent report, and return fire |
| 09 | 9 | 109 | IMPORTANT SECTION | Identification and MK-45 II two-point fire |

Stable lesson IDs remain unchanged for version-one save compatibility. Player
copy always refers to the display order (`LESSON 01`–`09`), never the internal
ID sequence.

## Interaction contract

- `FLEET DEPLOYMENT` starts with an empty friendly board. The player must place
  DD at E-2 facing south. A wrong position or orientation cannot commence.
- `DAMAGE REPORT` performs one authored hostile FIRE against F-2. The actual
  board receives one hit, the view stays on the friendly plot, and the report
  remains in the review phase until the player files it. Only then does return
  fire become available.
- All other lessons use authored fixed dispositions. Hostile normal actions are
  suppressed so the taught operation remains deterministic.
- Only the authored order advances a lesson. A wrong or incomplete order
  consumes no action, ammunition, record time, or enemy turn and leaves a
  persistent plain-language `TRAINING HOLD` explanation.
- The result page provides a debrief and routes to the first incomplete lesson.
  `TRAINING COMPLETE / 全教程修了` appears only when all nine stable IDs exist.

## Progress and authorization

- Web storage key: `deep-blue-grid.training-progress`.
- Version 1 canonical payload after full completion:
  `{ "version": 1, "completedLessons": [7, 1, 2, 3, 4, 5, 6, 8, 9] }`.
- Version-one records containing the original lesson IDs 1–6 remain valid. A
  complete old six-lesson record keeps its CASUAL authorization; the three new
  lessons do not revoke prior access and, when taken, still open in display
  order 01, 08, then 09.
- Values are deduplicated and normalized to the operational route. Invalid or
  unavailable storage falls back safely to an empty progress record.
- Mode authorization is stored separately in `deep-blue-grid.progression`.
  Completing all nine lessons records `training` and opens CASUAL.
- `?debug=all` opens every lesson and mode for testing, displays a permanent
  debug banner, and does not write training, mission, or progression results.
- A failed local save must raise `LOCAL RECORD NOT SAVED` immediately. Runtime
  access may continue, but the warning states that reload can restore the last
  durable authorization.

## UI and Unity requirements

- The index shows `AVAILABLE`, `LOCKED`, and `COMPLETE` without relying on color.
  A locked card names the preceding display lesson, not its stable internal ID.
- Plain Japanese instructions sit next to CIC terminology. The current action,
  coordinate, direction, and confirmation button must remain visible without
  hover or animation.
- Portrait places the current directive and thumb-reachable primary action
  before optional details. Landscape places the same controls in the right CIC
  rail. Minimum targets, focus handling, reduced motion, text scaling, and Safe
  Area follow `RESPONSIVE_UI_SPEC.md`.
- Unity imports `trainingStages`, `trainingProgress`, and the progression
  contract from `docs/unity-handoff/unity-content-v2.json`. It must reproduce
  the two authored state-machine lessons above rather than treating their
  metadata as static explanatory text.
