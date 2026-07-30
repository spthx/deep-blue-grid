# SURVIVAL / FOUR-OPERATION DIRECTIVE

This document is the implementation contract for the Web and Unity editions of
DEEP BLUE GRID. CASUAL and TACTICS keep their existing six-stage campaign.
SURVIVAL is a separate four-operation end-game route.

## Design intent

- A short run must still feel costly: failed engagements and retries remain in
  the operation record even when the fleet state is restored.
- Every operation must ask a different tactical question.
- Enemy rules remain fair. The AI receives only the information a player could
  receive under the same rules and never reads hidden cells.
- Persistent ship losses change both combat capability and the background pulse.
- SEA BAT is frightening because it breaks contact predictably, not because it
  cheats or attacks twice.

## Operation route

| No. | Codename | Enemy order of battle | Tactical purpose |
| --- | --- | --- | --- |
| 1 | DOUBLE SCREEN | Carrier, battleship, DE-01, DE-02 | Break two mutually supporting screens without spending the full arsenal too early. |
| 2 | RANGING FIRE | Existing campaign stage 3 fleet | A conventional combined-arms engagement used to measure accumulated damage. |
| 3 | SEA BAT | One SSX SEA BAT only | Hunt a two-contact submarine that alternates one attack with one silent relocation. |
| 4 | DEEP BLUE GRID | Carrier, battleship, cruiser, submarine; no escort or destroyer | Final fleet engagement. Its reduced order of battle gives a depleted force a measurable recovery path while AI strength remains close to campaign stage 4, so SEA BAT stays the run's psychological peak. |

Operation numbering shown to the player is always 1/4 through 4/4. Source
campaign stage IDs are internal data only and must not leak into SURVIVAL UI or
logs.

The non-cheating hunt breadth is deliberately staged at `8 / 5 / 1 / 3`.
DOUBLE SCREEN and RANGING FIRE choose among several equally plausible search
candidates, SEA BAT makes the strongest public-information choice, and the
final operation returns to a broader stage-four-style search. Target pursuit
after a confirmed hit is unchanged.

## DOUBLE SCREEN

- The two escorts are separate contacts and can be identified, hit, and sunk
  independently.
- Internal IDs are distinct (`escort` and `escortBravo`), while both use the
  same escort silhouette and role.
- Their displayed codes are DE-01 and DE-02.
- Initial enemy deployment tries to link DE-01 to the carrier and DE-02 to the
  battleship.
- An escort link is Boolean per capital ship. Two escorts beside one capital do
  not stack the bonus.

## SEA BAT

- SEA BAT occupies one cell but needs two successful contacts to sink.
- Enemy action 1, 3, 5...: one normal attack.
- Enemy action 2, 4, 6...: `SILENT RUNNING`; no attack, no wake, and one
  relocation attempt.
- It never relocates immediately merely because it was hit.
- Damage persists after relocation. The first hit remains as a last-known
  contact; the second valid hit sinks SEA BAT.
- A legal relocation destination must be:
  - inside the board;
  - an unshot cell;
  - outside every displayed passive-sonar result;
  - outside all wake markers;
  - different from the current cell;
  - unoccupied by another ship.
- Wake and passive-sonar overlays cannot soft-lock the engagement. If they
  cover every otherwise legal unshot destination, SEA BAT may cross one of
  those public signal overlays, but it still cannot enter a shot cell, its
  current cell, or another ship.
- If every non-current cell has already been fired upon, the player has
  completed containment. SEA BAT is forced to surface and the operation ends;
  it never becomes an unattackable one-cell/two-hit contact.
- Relocation never reveals the destination.
- The player-facing alert is:
  - `SILENT RUNNING`
  - `無音潜航`
  - `SONAR CONTACT LOST`

## Persistent losses and retry

- A cleared operation repairs all surviving ships and reloads all surviving
  weapons.
- A ship sunk in a cleared operation is removed from every later operation.
- Retrying restores the fleet that entered the current operation.
- A retry does not erase elapsed time, engagements, turns, shots, hits,
  specials, or damage from the failed attempt.
- Losses are committed to the persistent fleet only when an operation is won.

## Operation record

The final SURVIVAL result exposes:

- operation time, excluding time while the app is hidden;
- total engagements;
- retries;
- combat turns;
- shots, hits, and hit rate;
- special-system uses;
- total damage sustained, including failed attempts;
- confirmed losses from cleared operations;
- final surviving force and remaining hull sections;
- a per-operation summary.

The compact result view prioritizes time, damage, retries, surviving force, and
accuracy. Per-operation detail is collapsible.

## Dynamic command pulse

Both editions synthesize their sounds at runtime; no MP3, WAV, or OGG is
required.

The low command pulse accelerates by absolute fleet loss, never by duplicated
events:

| Losses from the original six-ship force | Pulse interval |
| ---: | ---: |
| 0 | 260 ms |
| 1 | 240 ms |
| 2 | 220 ms |
| 3 | 200 ms |
| 4 | 185 ms |
| 5 | 170 ms |

The interval is recalculated on stage initialization and after a sinking. A
single scheduler is used, and hidden/paused time is never replayed on resume.

## Validation matrix

Functional and visual checks are required at:

- 375x667, 390x844, 402x874 (phone portrait);
- 768x1024 and 1024x768 (tablet);
- 1280x720, 1366x700, 1536x730, 1920x850, 1920x1080 (desktop).

The following must be visible and operable without accidental clipping:

- all four operation-track entries;
- both escort contacts;
- SEA BAT silent-running alert;
- placement controls;
- weapon controls and the fire button;
- the compact operation-record summary.

Unity must additionally contain exactly one enabled `AudioListener`, must emit
no sounds while an advertisement or app pause is active, and must resume with
one scheduler only.
