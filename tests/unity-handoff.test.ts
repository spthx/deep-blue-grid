import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CELL_LABELS,
  ECHO_DIRECTIONS,
  ECHO_MODE,
  GRID_SIZE,
  HARPOON_PATTERN,
  ORIENTATIONS,
  SHIPS,
  STAGES,
  STANDARD_FLEET,
  WEAPON_MAX,
} from "../app/game/constants.ts";
import {
  FULL_FLEET,
  MISSION_LIBRARY,
  SURVIVAL_STAGES,
  TRAINING_STAGES,
} from "../app/game/Campaign.ts";
import {
  MISSION_RECORDS_STORAGE_KEY,
  MISSION_RECORDS_VERSION,
} from "../app/game/MissionRecords.ts";
import {
  TRAINING_LESSONS,
  TRAINING_PROGRESS_STORAGE_KEY,
  TRAINING_PROGRESS_VERSION,
} from "../app/game/TrainingProgress.ts";

const exported = JSON.parse(await readFile(new URL("../docs/unity-handoff/unity-content-v1.json", import.meta.url), "utf8"));
const manifestUrl = new URL("../docs/unity-handoff/manifest.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

test("Unity handoff export matches the canonical Web content", () => {
  assert.equal(exported.schema, "deep-blue-grid.unity-content");
  assert.equal(exported.schemaVersion, 1);
  assert.deepEqual(exported.coordinateContract, {
    gridSize: GRID_SIZE,
    cellLabels: CELL_LABELS,
    origin: "top-left",
    displayExample: { label: "A-1", coord: { x: 0, y: 0 } },
    orientations: ORIENTATIONS,
    rotationOrder: ORIENTATIONS,
  });
  assert.deepEqual(exported.echo, { mode: ECHO_MODE, directions: ECHO_DIRECTIONS });
  assert.deepEqual(exported.fleets, { standard: STANDARD_FLEET, full: FULL_FLEET });
  assert.deepEqual(exported.shipDefinitions, SHIPS);
  assert.deepEqual(exported.weapons, { maximumUses: WEAPON_MAX, harpoonPattern: HARPOON_PATTERN });
  assert.deepEqual(exported.campaignStages, STAGES);
  assert.deepEqual(exported.survivalStages, SURVIVAL_STAGES);
  assert.deepEqual(exported.missions, MISSION_LIBRARY);
  assert.deepEqual(exported.trainingStages, TRAINING_STAGES);
});

test("Unity handoff export preserves counts and persistence contracts", () => {
  assert.deepEqual(exported.contentCounts, {
    casualStages: 6,
    tacticsStages: 6,
    survivalStages: 4,
    missions: { total: 22, standard: 12, archive: 4, extreme: 6 },
    trainingStages: 6,
  });
  assert.deepEqual(exported.persistence, {
    missionRecords: {
      storageKey: MISSION_RECORDS_STORAGE_KEY,
      version: MISSION_RECORDS_VERSION,
    },
    trainingProgress: {
      storageKey: TRAINING_PROGRESS_STORAGE_KEY,
      version: TRAINING_PROGRESS_VERSION,
      lessons: TRAINING_LESSONS,
    },
  });
});

test("Unity handoff data and visual references match the published checksums", async () => {
  const checksumText = await readFile(new URL("../docs/unity-handoff/SHA256SUMS.txt", import.meta.url), "utf8");
  const entries = checksumText.trim().split("\n").map((line) => {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match, `invalid checksum line: ${line}`);
    return { expected: match[1], path: match[2] };
  });

  assert.equal(entries.length, 12);
  for (const entry of entries) {
    const contents = await readFile(new URL(`../${entry.path}`, import.meta.url));
    const actual = createHash("sha256").update(contents).digest("hex");
    assert.equal(actual, entry.expected, entry.path);
  }
});

test("Unity handoff manifest references only packaged files", async () => {
  const paths = [
    manifest.primaryContent,
    manifest.checksums,
    manifest.generator,
    ...manifest.documentation,
    ...manifest.visualReferences,
    ...manifest.socialArtwork.map((asset: { path: string }) => asset.path),
    ...manifest.runtimeGeneratedPresentation.visualSource,
    manifest.runtimeGeneratedPresentation.audioSource,
    manifest.fonts.licenseContract,
  ];

  for (const path of paths) {
    const contents = await readFile(new URL(path, manifestUrl));
    assert.ok(contents.length > 0, path);
  }
});
