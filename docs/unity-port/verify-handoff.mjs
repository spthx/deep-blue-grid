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

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

console.log(
  `Unity handoff verified: ${sourcePairs.length} canonical source copies, commit ${expectedCommit}.`,
);
