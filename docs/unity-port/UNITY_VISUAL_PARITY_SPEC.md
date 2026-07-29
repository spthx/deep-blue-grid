# DEEP BLUE GRID Unity visual parity specification

Canonical Web revision: `69f5c566ebfde8cb0eca814fe0f5d8f04b291834`

This document defines the visual contract for the Android portrait port. It is
not a general art-direction suggestion. Where this document and an older Unity
screen disagree, this document and the canonical Web source take precedence.

Canonical sources:

- `app/globals.css`
- `app/game/Renderer.ts`
- `app/game/DeepBlueGrid.tsx`

## 1. Visual objective

The screen is a dark naval CIC / radar console. Its tension comes from restrained
contrast, precise information hierarchy, and short signal-like animations.
It must not read as a bright science-fiction HUD.

Do not use these older Unity traits as references:

- a large, bright full-screen Cartesian grid;
- decorative sonar rings behind the whole interface;
- thick saturated-cyan board borders;
- flat, single-colour button rectangles;
- detailed painted or photorealistic ship sprites on the tactical grid;
- large explosion sprites, scorch textures, or full-cell red damage fills;
- one generic framed card for every telegraph and alert.

## 2. Canonical palette

| Role | Hex | Unity sRGB |
|---|---:|---:|
| Abyss | `#06131d` | `(0.024, 0.075, 0.114)` |
| Navy | `#0a2635` | `(0.039, 0.149, 0.208)` |
| Teal | `#144b59` | `(0.078, 0.294, 0.349)` |
| Steel | `#71909b` | `(0.443, 0.565, 0.608)` |
| Cyan | `#7ce5df` | `(0.486, 0.898, 0.875)` |
| Foam | `#e2fff8` | `(0.886, 1.000, 0.973)` |
| Danger | `#ff8585` | `(1.000, 0.522, 0.522)` |
| Amber | `#e5d78a` | `(0.898, 0.843, 0.541)` |

Brightness should be concentrated in text, state markers, and momentary
telegraphs. Large surfaces remain in Abyss/Navy.

## 3. Whole-screen CIC atmosphere

Render in this order:

1. Abyss base.
2. A subtle cyan radial glow centred above the top edge. Web equivalent:
   `#174a5b` at the origin, transparent by 42% of the screen.
3. A one-pixel horizontal highlight every four logical pixels at 1.8% white.
4. Two sparse, non-animated noise fields at 6% layer opacity:
   - one-pixel dots on a `29 x 31` logical-pixel repeat;
   - one-pixel dots on a `43 x 47` logical-pixel repeat.
5. UI, board, and overlays.
6. A final multiply scanline: one dark pixel every four logical pixels,
   equivalent to `rgba(1,10,15,.16)`.

The atmosphere must remain visible without competing with labels. At a normal
phone viewing distance, the player should perceive texture rather than count
the dots or lines.

Unity implementation:

- Prefer one procedural `MaskableGraphic` with deterministic vertices or small
  repeatable textures.
- Do not redraw the full texture every frame.
- Do not add a large background coordinate grid or free-floating sonar target.
- Reduced-motion mode keeps all static texture layers and disables only motion.

## 4. Panel and tactical board material

### Panel

- Outer border: one logical pixel, `#41636d`.
- Corner treatment: small eight-pixel cut impression, not a large chamfer.
- Fill: `#193843` only in the cut corner accents, otherwise `#0a202a`.
- Inner frames: three logical pixels of `#07141b`, then one of `#294d57`.
- Shadow: restrained black depth below the panel; no cyan outer neon frame.

### Board

- Outer border: two logical pixels, `#52757d`.
- Dark four-pixel outside keyline: `#07131a`.
- Base: `#092934`.
- Inner vignette: black, approximately `40px` reach at the canonical Web size.
- Grid cells:
  - ordinary `#0a303a`;
  - slow water variation `#0d3943`;
  - grid line `rgba(113,144,155,.27)`;
  - one faint water trace per cell `rgba(124,229,223,.06)`.
- Coordinate labels: Steel, small bold monospace.
- Board radar fan: cyan conic sector at approximately 9% opacity, one rotation in
  seven seconds. It is ambience, not a target marker.

The board border must not be a thick, fully saturated cyan rectangle.

## 5. Command-button material

All command buttons require a layered surface. A flat `Image.color` is not
acceptable.

Base state:

- minimum touch size: `44dp`;
- top-to-bottom fill: `#183b45` to `#0a222c`;
- one-pixel outer border: `#52727a`;
- lower border: `#203b43`;
- two-pixel inset keyline: `#07171f`;
- three-pixel lower extrusion: `#041015`;
- label: Foam; main command text: Cyan; secondary text: Steel;
- left-aligned text except compact utility icons.

State variants:

| State | Required change |
|---|---|
| Selected | Cyan outer border and restrained cyan glow |
| Pressed | translate down 2px; extrusion reduces from 3px to 1px |
| Disabled | 40% opacity and desaturated; preserve silhouette |
| Primary | fill `#30707a` to `#133b46`, border `#93f2e9` |
| Confirm-ready | fill `#756329` to `#302a17`, Amber border/glow, 1.1s brightness pulse |
| Battle start | fill `#a8342f` to `#4a1210`, Danger border and restrained red glow |

Implement the gradient, inset line, and extrusion procedurally or with a
nine-sliced sprite generated from the canonical values. Do not fake every
state by changing only the root rectangle colour.

## 6. Telegraph hierarchy

These messages are deliberately different. Reusing one generic modal card
weakens the information hierarchy.

### Turn flash

- Full-screen Abyss veil at 67% alpha.
- A full-width horizontal signal band with only top and bottom hairlines.
- Large spaced command text and a smaller Foam subtitle.
- Cyan for own transition, Danger for enemy transition.
- Total duration `1.05s`: fade in to 25%, hold through 70%, fade out.

### Radar result

- Centred, maximum Web-equivalent width `520px`.
- Dark `#071920f2` surface.
- One-pixel frame with a three-pixel state bar on the left.
- `NO CONTACT`: Cyan/green family.
- Own `CONTACT`: Amber.
- Enemy successful detection: Danger, red left-to-right dark gradient and
  `FLEET DETECTED`; never present it as neutral information.
- Total duration `1.45s`, scale `0.92 -> 1.0`, hold, fade.

### Identification / vital alert

- Positioned near the upper information area, not in the radar-result centre.
- Amber for enemy identification gained.
- Danger for own vital section hit / own ship identified.
- Own vital alert persists until the player completes `DAMAGE ASSESSMENT`.
- One dark inner frame, restrained glow, `1.65s` for non-persistent alerts.

### Damage assessment

- Sticky lower Amber band, not a centred modal.
- Report text remains readable while the board is visible.
- Confirmation is a large right-hand button reachable by the thumb.
- The report and warning remain until the player explicitly confirms.

## 7. Canonical damage rendering

Damage is tactical information, not an explosion decal.

### Persistent draw order

The order below is mandatory:

1. board surface and grid;
2. radar scans;
3. ship silhouette;
4. intact critical-section marker;
5. shot marks: MISS, ECHO, HIT, SUNK;
6. hit critical-section outline;
7. identification marker;
8. submarine wakes;
9. cursor, target, and active-weapon overlays;
10. placement/support previews.

### A normal hit on a visible own ship

1. Keep the flat ship silhouette visible.
2. On the struck ship cell, add a small Danger disc:
   - centre of the cell;
   - radius `0.12 x cell`;
   - solid `#ff8585`.
3. Above it, draw the board HIT mark:
   - eight alternating vertices, which read as a four-point star;
   - outer radius `0.27 x cell`;
   - inner radius `0.16 x cell`;
   - Danger;
   - alpha `0.70 + 0.25 * sin(time * 8)`.

The small disc means structural damage on the hull. The pulsing star means the
recorded shot result. Both are intentionally visible.

### A critical-section hit

- Keep the normal-hit layers.
- Replace the intact filled Cyan diamond with a larger Danger outline diamond.
- Radius `0.31 x cell`.
- Line width `0.045 x cell`.
- Alpha `0.78 + 0.20 * sin(time * 7)`.

### A sunk ship

- Recolour the complete silhouette to the subdued sunk palette:
  `#584e51`, `#40383a`, and `#4a3b3e` at approximately 55% alpha.
- Mark every occupied cell with the Amber SUNK star, using the same geometry
  and pulse as HIT.
- Do not retain a bright intact hull, and do not cover the entire footprint
  with one explosion image.

### Momentary impact feedback

A short expanding ring and a `0.28s` board shake may accompany a hit. They are
temporary effects and never replace the persistent disc/star layers.

Canonical shake offsets from the unmodified board position:

- 20%: `( +4, -2 )`;
- 45%: `( -5, +3 )`;
- 70%: `( +3, +2 )`;
- completion: exact baseline.

Never accumulate offsets between impacts.

## 8. Portrait acceptance captures

Before visual parity is declared complete, capture all of these from the current
Unity build at the Android portrait reference size:

1. mode/mission opening;
2. placement with normal, selected, disabled, and Battle Start buttons;
3. ordinary attack-selection state;
4. own ship with one normal hit;
5. own critical-section hit with persistent warning;
6. a sunk multi-cell ship;
7. own `CONTACT`;
8. own `NO CONTACT`;
9. enemy `FLEET DETECTED`;
10. `DAMAGE ASSESSMENT` before confirmation;
11. reduced-motion equivalents for one hit and one radar result.

For every capture verify:

- no detailed ship atlas remains on the tactical board;
- no text is clipped;
- no panel or action needs a micro-scroll;
- touch controls are at least `44dp`;
- scanline/noise remain subtle;
- board and button frames are not saturated neon outlines;
- the current board state remains legible behind non-modal information.
