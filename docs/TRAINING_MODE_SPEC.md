# INITIAL TRAINING / 初任訓練

INITIAL TRAINING is a separate, freely selectable six-lesson tutorial mode.
It uses fixed, non-random boards and suppresses hostile actions so each lesson
teaches one operation without a combat penalty. Lessons may be repeated in any
order and do not affect Campaign, SURVIVAL, or MISSION records.

| Lesson | Title | Focus |
| ---: | --- | --- |
| 1 | TACTICAL PLOT | Coordinate reading and FIRE |
| 2 | ACOUSTIC BEARING | Four-direction ECHO correlation |
| 3 | CROSS FIX | Hull reconstruction and STRADDLE orientation |
| 4 | ESCORT SUPPORT | Carrier escort link and two F-4 sorties |
| 5 | FIRE CONTROL LINK | Battleship link and HARPOON allocation |
| 6 | SILENT TRACE | Wake reading, 2×2 PASSIVE SONAR, and contact close |

## Directive and completion contract

- A lesson presents one ordered directive at a time, with the current step and
  its tactical-plot highlight exposed to assistive technology through a polite
  live region.
- Only the authored order advances the lesson. A wrong or incomplete order
  consumes no friendly action, ammunition, timer/record action, or enemy turn;
  the current directive is shown again and a persistent `TRAINING HOLD` notice
  states in plain Japanese that no action or ammunition was consumed.
- Completion is recorded only when the lesson objective succeeds. The result
  screen provides the debrief and a repeat or next-lesson action.
- `TRAINING COMPLETE / 全教程修了` is shown only when all six completion IDs
  are present. Finishing Lesson 6 first remains a single `LESSON COMPLETE` and
  returns to the index instead of implying that the earlier lessons are done.
- After a lesson clear, `NEXT LESSON` targets the first actually incomplete
  lesson. If the just-cleared lesson completed all six, the primary action is
  `TRAINING INDEX`; it never routes through an already completed lesson.

## Progress persistence

- Web storage key: `deep-blue-grid.training-progress`.
- Version 1 payload: `{ "version": 1, "completedLessons": [1, 2, 3, 4, 5, 6] }`.
- Completed lessons are deduplicated and sorted. Invalid, unavailable, or
  malformed storage falls back safely to an empty progress record.
- Progress is independent from MISSION best-order/best-time records and is
  updated idempotently, so replaying a completed lesson cannot duplicate it.

## UI, accessibility, and responsive requirements

- The mode selector and training index must identify this as `INITIAL TRAINING`,
  show completed lessons out of six, and keep every lesson available for replay.
- Library state is labeled `UNCLEARED` or `CLEARED/COMPLETE`; the completion
  filter resets to `ALL` when switching categories so a stale filter cannot
  present an unexplained empty index.
- The active directive, instruction, plain-language explanation, and completion
  status must be available without relying on color, hover, or animation.
- On narrow screens, preserve the directive and primary action before optional
  explanation; the explanation may collapse but must remain reopenable. Do not
  clip the lesson title, directive, debrief, or completion count.
- Keyboard, touch, and screen-reader flows must retain the same non-consuming
  wrong-order behavior. Minimum target sizes, dialog focus handling, reduced
  motion, and safe-area rules follow `RESPONSIVE_UI_SPEC.md`.

## Unity handoff

Unity should model lessons as authored `TrainingPlan` data, preserve the same
step-order and no-consumption rule, and store only the versioned completed
lesson IDs in the platform save data. Its training index, directive panel,
debrief, accessibility labels, responsive layout, and safe-area behavior must
match the Web contract; see `UNITY_UI_HANDOFF.md` for the shared UI handoff.
