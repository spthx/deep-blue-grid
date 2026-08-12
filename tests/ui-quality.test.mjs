import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const component = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");

test("interactive CIC surfaces own their material instead of depending on screen z-order", () => {
  assert.match(css, /DETERMINISTIC CIC MATERIAL/);
  assert.match(css, /\.mission-card,[\s\S]*\.utility-overlay button,[\s\S]*\.ship-card/);
  assert.match(css, /\)::after \{[\s\S]*z-index:-1;[\s\S]*var\(--cic-grain-a\)/);
  assert.match(css, /\.game-shell::before \{[\s\S]*z-index: -1;/);
  assert.match(css, /\.noise \{[\s\S]*z-index: -2;/);
});

test("compact touch controls preserve the 44px floor and do not fade through their backing", () => {
  assert.match(css, /\.placement-restore \{[\s\S]*min-height:var\(--tap-target\)/);
  assert.match(css, /\.ship-card \{[^}]*min-height:var\(--tap-target\)/);
  assert.match(css, /\.cmd:disabled \{ opacity:1;/);
  assert.match(css, /\.cmd\.unavailable \{ opacity:1;/);
});

test("motion preference covers the canvas loop and utility icons are deterministic vectors", () => {
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /if \(!reducedMotion\) animation\.current = requestAnimationFrame\(render\)/);
  assert.match(component, /function SoundGlyph/);
  assert.match(component, /function RetryGlyph/);
  assert.doesNotMatch(component, /🔊|🔇|⚔/u);
});
