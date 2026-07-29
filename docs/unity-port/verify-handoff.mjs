import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const handoffDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(handoffDir, "..", "..");
const expectedCommit = "69f5c566ebfde8cb0eca814fe0f5d8f04b291834";

const sourcePairs = [
  ["app/game/AfterAction.ts", "canonical-source/AfterAction.ts"],
  ["app/game/AudioManager.ts", "canonical-source/AudioManager.ts"],
  ["app/game/Campaign.ts", "canonical-source/Campaign.ts"],
  ["app/game/constants.ts", "canonical-source/constants.ts"],
  ["app/game/DeepBlueGrid.tsx", "canonical-source/DeepBlueGrid.tsx"],
  ["app/game/EnemyAI.ts", "canonical-source/EnemyAI.ts"],
  ["app/game/engine.ts", "canonical-source/engine.ts"],
  ["tests/game-rules.test.ts", "canonical-source/game-rules.test.ts"],
  ["app/globals.css", "canonical-source/globals.css"],
  ["tests/rendered-html.test.mjs", "canonical-source/rendered-html.test.mjs"],
  ["app/game/Renderer.ts", "canonical-source/Renderer.ts"],
  ["app/game/SubmarineWake.ts", "canonical-source/SubmarineWake.ts"],
];

const effectPngs = [
  ["echo-8x1.png", 2048, 256],
  ["hit-sunk-pulses-8x2.png", 2048, 512],
  ["submarine-wake-shared-phase-12x1.png", 3072, 256],
  ["radar-contact-no-contact-12x2.png", 3072, 512],
  ["target-vital-identification-pulses-8x4.png", 2048, 1024],
  ["web-overlay-effect-storyboard.png", 1600, 2050],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readPngHeader(buffer) {
  const signature = "89504e470d0a1a0a";
  assert(buffer.subarray(0, 8).toString("hex") === signature, "Invalid PNG signature.");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const gameplay = JSON.parse(
  await readFile(path.join(handoffDir, "canonical-gameplay.json"), "utf8"),
);

assert(
  gameplay.canonicalSource.commit === expectedCommit,
  "canonical-gameplay.json points at an unexpected source commit.",
);
assert(gameplay.display.gridSize === 8, "Board must be 8x8.");
assert(gameplay.ships.length === 7, "Expected six standard ships plus SSX-00.");
assert(gameplay.stages.length === 6, "Current canonical campaign must contain six stages.");
assert(gameplay.echo.mode === "orthogonal", "ECHO must use the four orthogonal directions.");
assert(
  gameplay.weapons.find((weapon) => weapon.id === "harpoon")?.linkedUses === 3,
  "Escort-supported HARPOON maximum must be three uses.",
);
assert(
  gameplay.knownCurrentStateClarifications.includes(
    "SURVIVAL Stage 6 enemy fleet still includes escort.",
  ),
  "The current Survival stage 6 escort clarification is missing.",
);

for (const [sourceRelative, copyRelative] of sourcePairs) {
  const source = await readFile(path.join(repoRoot, sourceRelative));
  const copy = await readFile(path.join(handoffDir, copyRelative));
  assert(
    sha256(source) === sha256(copy),
    `Canonical source copy differs from repository source: ${sourceRelative}`,
  );
}

const effectMetadata = JSON.parse(
  await readFile(path.join(handoffDir, "images", "effects", "effect-assets.json"), "utf8"),
);
assert(effectMetadata.cellSizePx === 256, "Effect sprite cells must be 256x256.");
for (const [file, expectedWidth, expectedHeight] of effectPngs) {
  const png = await readFile(path.join(handoffDir, "images", "effects", file));
  const header = readPngHeader(png);
  assert(
    header.width === expectedWidth && header.height === expectedHeight,
    `Unexpected effect image dimensions: ${file}`,
  );
  assert(
    header.colorType === 4 || header.colorType === 6,
    `Effect image does not contain an alpha channel: ${file}`,
  );
}

console.log(
  `Unity handoff verified: ${sourcePairs.length} canonical source copies, ${effectPngs.length} effect PNGs, commit ${expectedCommit}.`,
);
