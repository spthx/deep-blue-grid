# CIC UI surface assets

These vectors are derived from the current Web canonical implementation in
`app/globals.css`. They are deliberately code-native rather than painted
artwork: the Unity port should preserve the sharp CIC furniture, restrained
phosphor glow, and readable state hierarchy at every phone resolution.

## Files

| Asset | Intended use |
| --- | --- |
| `cic-scanline-noise-tile.svg` | A transparent 64×64 repeat overlay. It contains the canonical four-pixel scan rhythm and subdued cyan phosphor specks. |
| `radar-board-surface-sample.svg` | A complete panel/board composition reference: abyss room glow, clipped tactical panel, steel canvas rim, 8×8 grid, vignette, scan texture, and a low-opacity radar sweep. |
| `command-button-state-strip.svg` | Named vector groups for normal, selected, pressed, disabled, confirmation-ready, and battle-start command surfaces. |

## Canonical palette

| Token | Value |
| --- | --- |
| Abyss | `#06131d` |
| Navy | `#0a2635` |
| Teal | `#144b59` |
| Steel | `#71909b` |
| Cyan | `#7ce5df` |
| Foam | `#e2fff8` |
| Danger | `#ff8585` |
| Amber | `#e5d78a` |

## Unity implementation notes

- Use the 64×64 tile as a full-screen `RawImage`/UI texture with repeat
  wrapping. Keep it above the ordinary UI and below modal reports. Do not
  increase the noise opacity; the Web values are only `.06` for specks and
  `.16` for the dark scan row.
- Treat `radar-board-surface-sample.svg` as a layer specification, not as a
  reason to flatten the live board into one texture. Grid data, sweep,
  silhouettes, damage marks, and targeting still need independent draw
  layers.
- The board sweep is intentionally faint (`.09`). The radar character comes
  from the combined grid, vignette, panel rim, scanline, noise, and sweep—not
  from making the sweep bright.
- Rebuild command buttons from the named strip states or equivalent 9-sliced
  surfaces. Every ordinary button has four visible depths: dark bottom
  extrusion, vertical face gradient, one-pixel rim, and two-pixel abyss inner
  line. A flat tinted rectangle is not canonical.
- Pressed state moves the whole face down two pixels and contracts the
  extrusion from three pixels to one. Selected state adds only the cyan rim
  and restrained glow; confirmation and battle states change the material
  colour as well.
- Preserve hard/square corners. Avoid modern rounded-card styling, large soft
  shadows, or opaque decorative textures: this is a naval CIC terminal, not a
  generic mobile dashboard.
