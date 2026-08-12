import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AUDIO_CUE_CONTRACT } from "../app/game/AudioManager.ts";
import { SILENT_PROFILE_CONTRACT } from "../app/game/EnemyAI.ts";
import {
  AI_MODE_CONTRACT,
  FULL_FLEET,
  MISSION_LIBRARY,
  MODE_RULE_CONTRACT,
  SURVIVAL_STAGES,
  TRAINING_STAGES,
} from "../app/game/Campaign.ts";
import {
  CELL_LABELS,
  ECHO_DIRECTIONS,
  ECHO_MODE,
  GRID_SIZE,
  HARPOON_PATTERN,
  ORIENTATIONS,
  RADAR_PATTERN,
  SHIPS,
  STAGES,
  STANDARD_FLEET,
  STRADDLE_PATTERN,
  WEAPON_MAX,
} from "../app/game/constants.ts";
import {
  ACTION_LABEL,
  CIC_MATERIAL_CONTRACT,
  LOST_CAPABILITY,
  MISSION_DIFFICULTY_NAME,
  PRESENTATION_TIMINGS_MS,
  RESPONSIVE_UI_CONTRACT,
  SHIP_DOSSIER,
  UI_TEXT_CATALOG,
  UNITY_SAVE_DATA_CONTRACT,
  WEAPON_PRESENTATION,
} from "../app/game/PresentationContract.ts";
import { FORMATION_SUPPORT_CONTRACT, SEEDED_RANDOM_CONTRACT } from "../app/game/engine.ts";
import {
  MISSION_RECORDS_STORAGE_KEY,
  MISSION_RECORDS_VERSION,
} from "../app/game/MissionRecords.ts";
import {
  TRAINING_LESSONS,
  TRAINING_PROGRESS_STORAGE_KEY,
  TRAINING_PROGRESS_VERSION,
} from "../app/game/TrainingProgress.ts";
import { SUBMARINE_WAKE_CONTRACT } from "../app/game/SubmarineWake.ts";
import { CANONICAL_MISSION_ROUTES } from "../scripts/measure-missions.ts";

const runtimeUrl = new URL("../docs/unity-handoff/unity-content-v2.json", import.meta.url);
const validationUrl = new URL("../docs/unity-handoff/unity-validation-v1.json", import.meta.url);
const manifestUrl = new URL("../docs/unity-handoff/manifest.json", import.meta.url);
const exported = JSON.parse(await readFile(runtimeUrl, "utf8"));
const validationFixture = JSON.parse(await readFile(validationUrl, "utf8"));
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

test("Unity runtime handoff matches canonical domain and content", () => {
  assert.equal(exported.schema, "deep-blue-grid.unity-content");
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.sourceRef, "unity-handoff-2026-08-12-quality");
  assert.equal(exported.distribution, "runtime-safe");
  assert.equal(exported.validationSolutionsIncluded, false);
  assert.deepEqual(exported.coordinateContract, {
    gridSize: GRID_SIZE,
    cellLabels: CELL_LABELS,
    origin: "top-left",
    displayExample: { label: "A-1", coord: { x: 0, y: 0 } },
    orientations: ORIENTATIONS,
    rotationOrder: ORIENTATIONS,
  });
  assert.deepEqual(exported.rules, {
    echo: { mode: ECHO_MODE, directions: ECHO_DIRECTIONS },
    aiModes: AI_MODE_CONTRACT,
    gameModes: MODE_RULE_CONTRACT,
    silentProfile: SILENT_PROFILE_CONTRACT,
    submarineWake: SUBMARINE_WAKE_CONTRACT,
    seededRandom: SEEDED_RANDOM_CONTRACT,
    formationSupport: FORMATION_SUPPORT_CONTRACT,
  });
  assert.deepEqual(exported.fleets, { standard: STANDARD_FLEET, full: FULL_FLEET });
  assert.deepEqual(exported.shipDefinitions, SHIPS);
  assert.deepEqual(exported.weapons, {
    maximumUses: WEAPON_MAX,
    patterns: {
      harpoon: HARPOON_PATTERN,
      radar: RADAR_PATTERN,
      straddle: STRADDLE_PATTERN,
    },
  });
  assert.deepEqual(exported.campaignStages, STAGES);
  assert.deepEqual(exported.survivalStages, SURVIVAL_STAGES);
  assert.deepEqual(exported.missions, MISSION_LIBRARY);
  assert.deepEqual(exported.trainingStages, TRAINING_STAGES);
});

test("Unity runtime handoff matches presentation and audio contracts", () => {
  assert.deepEqual(exported.presentation, {
    weaponSystems: WEAPON_PRESENTATION,
    actionLabels: ACTION_LABEL,
    commonText: UI_TEXT_CATALOG,
    shipDossiers: SHIP_DOSSIER,
    lostCapabilities: LOST_CAPABILITY,
    missionDifficultyNames: MISSION_DIFFICULTY_NAME,
    timingsMs: PRESENTATION_TIMINGS_MS,
    responsiveUi: RESPONSIVE_UI_CONTRACT,
    cicMaterial: CIC_MATERIAL_CONTRACT,
  });
  assert.deepEqual(exported.audio, AUDIO_CUE_CONTRACT);
});

test("Unity runtime handoff preserves counts and persistence contracts", () => {
  assert.deepEqual(exported.contentCounts, {
    casualStages: 6,
    tacticsStages: 6,
    survivalStages: 4,
    missions: { total: 28, standard: 16, archive: 5, extreme: 7 },
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
    unitySaveData: UNITY_SAVE_DATA_CONTRACT,
  });
});

test("canonical solutions are isolated in the editor-only validation fixture", () => {
  const runtimeText = JSON.stringify(exported);
  assert.equal(runtimeText.includes("canonicalMissionRoutes"), false);
  assert.equal(runtimeText.includes("complete mission solutions"), false);
  assert.equal(runtimeText.includes('"rationale"'), false);
  assert.equal(runtimeText.includes('"evidence"'), false);

  assert.equal(validationFixture.schema, "deep-blue-grid.unity-validation");
  assert.equal(validationFixture.schemaVersion, 1);
  assert.equal(validationFixture.sourceRef, exported.sourceRef);
  assert.equal(validationFixture.distribution, "editor-test-only");
  assert.equal(validationFixture.excludeFromPlayerBuild, true);
  assert.equal(validationFixture.missionCount, MISSION_LIBRARY.length);
  assert.deepEqual(validationFixture.canonicalMissionRoutes, CANONICAL_MISSION_ROUTES);
  assert.deepEqual(
    Object.keys(validationFixture.canonicalMissionRoutes).map(Number).sort((a, b) => a - b),
    MISSION_LIBRARY.map((mission) => mission.id).sort((a, b) => a - b),
  );
});

test("Unity handoff checksums cover exactly the manifest targets", async () => {
  const checksumText = await readFile(new URL("../docs/unity-handoff/SHA256SUMS.txt", import.meta.url), "utf8");
  const entries = checksumText.trim().split("\n").map((line) => {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match, `invalid checksum line: ${line}`);
    return { expected: match[1], path: match[2] };
  });

  const manifestTargets = manifest.checksumTargets.map((path: string) => {
    const resolved = fileURLToPath(new URL(path, manifestUrl));
    return relative(".", resolved);
  });
  const portablePath = (path: string) => path.replaceAll("\\", "/").toLowerCase();
  const checksumTargets = entries.map((entry) => portablePath(entry.path));
  assert.deepEqual(checksumTargets, manifestTargets.map(portablePath));

  for (const entry of entries) {
    const contents = await readFile(new URL(`../${entry.path}`, import.meta.url));
    const actual = createHash("sha256").update(contents).digest("hex");
    assert.equal(actual, entry.expected, entry.path);
  }
});

test("Unity handoff manifest references only packaged files", async () => {
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.sourceRef, exported.sourceRef);
  assert.equal(manifest.primaryContent, "unity-content-v2.json");
  assert.equal(manifest.editorValidationFixture, "unity-validation-v1.json");
  assert.deepEqual(manifest.runtimeExclusions, ["unity-validation-v1.json"]);

  const paths = [
    manifest.primaryContent,
    manifest.editorValidationFixture,
    manifest.checksums,
    manifest.generator,
    ...manifest.contractSources,
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
