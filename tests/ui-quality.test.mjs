import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const component = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
const briefingCoach = await readFile(new URL("../app/game/BriefingCoach.tsx", import.meta.url), "utf8");
const briefingSequence = await readFile(new URL("../app/game/BriefingSequence.ts", import.meta.url), "utf8");

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

test("visual training reel remains readable, bounded, and reusable across operation flows", () => {
  assert.match(css, /VISUAL TRAINING REEL/);
  assert.match(css, /\.briefing-coach \{[\s\S]*?position:fixed;[\s\S]*?z-index:110/);
  assert.match(css, /\.briefing-copy > p \{[^}]*font-size:13px;[^}]*line-height:1\.72/);
  assert.match(css, /orientation:portrait[\s\S]*?\.briefing-copy > p \{[^}]*font-size:14px/);
  assert.match(css, /\.briefing-controls button \{[^}]*min-height:var\(--tap-target\)/);
  assert.match(css, /prefers-reduced-motion:reduce[\s\S]*?\.briefing-focus-frame/);
  assert.match(briefingCoach, /role="dialog"/);
  assert.match(briefingCoach, /window\.innerWidth - left - 4/);
  assert.match(briefingCoach, /window\.innerHeight - top - 4/);
  assert.match(briefingCoach, /visualViewport\?\.addEventListener\("resize"/);
  assert.match(briefingCoach, /onDismiss\("complete"\)/);
  assert.match(briefingCoach, /onDismiss\("skip"\)/);
  assert.match(briefingSequence, /"training-intro" \| "training-debrief" \| "mode-intro" \| "operation-clear"/);
  assert.match(briefingSequence, /export function buildBriefingSequence/);
  assert.match(briefingSequence, /buildModeIntroductionSequence/);
  assert.match(briefingSequence, /buildOperationClearSequence/);
  assert.ok((component.match(/data-briefing-anchor=/g) ?? []).length >= 12);
});

test("novice training owns the center with animated hints and a one-tap completion escape", () => {
  assert.match(css, /\.presentation-center-stage \.briefing-console \{[\s\S]*place-items|\.presentation-center-stage\.briefing-coach \{[\s\S]*place-items:center/);
  assert.match(css, /grid-template-columns:minmax\(250px,42%\) minmax\(0,1fr\)/);
  assert.match(css, /\.briefing-motion-grid \{[\s\S]*grid-template-columns:repeat\(8,1fr\)/);
  assert.match(css, /@keyframes briefingHintHand/);
  assert.match(css, /@keyframes briefingShipPlacement/);
  assert.match(css, /\.briefing-demo-destination/);
  assert.match(css, /\.briefing-action-strip/);
  assert.match(css, /\.briefing-quick-complete \{[\s\S]*min-height:62px/);
  assert.match(briefingCoach, /HINT \/ ここだけ覚える/);
  assert.match(briefingCoach, /いまやること/);
  assert.match(briefingCoach, /plainActionHint/);
  assert.match(briefingCoach, /ここへ置く/);
  assert.match(briefingCoach, /艦を押す/);
  assert.match(briefingCoach, /ONE TAP CLEAR/);
  assert.match(component, /quickCompleteTraining/);
});
