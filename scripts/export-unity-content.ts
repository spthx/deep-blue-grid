import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
  AI_MODE_CONTRACT,
  FULL_FLEET,
  MISSION_LIBRARY,
  MODE_RULE_CONTRACT,
  SURVIVAL_STAGES,
  TRAINING_STAGES,
} from "../app/game/Campaign.ts";
import { AUDIO_CUE_CONTRACT } from "../app/game/AudioManager.ts";
import { SILENT_PROFILE_CONTRACT } from "../app/game/EnemyAI.ts";
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
import { CANONICAL_MISSION_ROUTES } from "./measure-missions.ts";

const SOURCE_REF = "unity-handoff-2026-08-12-quality";
const handoffDirectory = resolve("docs/unity-handoff");
const runtimeOutputPath = resolve(handoffDirectory, "unity-content-v2.json");
const validationOutputPath = resolve(handoffDirectory, "unity-validation-v1.json");
const manifestOutputPath = resolve(handoffDirectory, "manifest.json");
const checksumsOutputPath = resolve(handoffDirectory, "SHA256SUMS.txt");

const visualReferences = [
  "../unity-reference/01-phone-mode-select-402x874.png",
  "../unity-reference/02-phone-mission-index-402x874.png",
  "../unity-reference/03-phone-training-index-402x874.png",
  "../unity-reference/04-phone-training-brief-402x874.png",
  "../unity-reference/05-phone-battle-command-402x874.png",
  "../unity-reference/06-desktop-battle-command-1366x768.png",
  "../unity-reference/07-desktop-impact-1366x768.png",
  "../unity-reference/08-desktop-sonar-wake-1366x768.png",
  "../unity-reference/09-desktop-sonar-contact-1366x768.png",
  "../unity-reference/10-phone-fleet-placement-402x874.png",
] as const;

const handoffDocumentation = [
  "../UNITY_HANDOFF_INDEX.md",
  "../UNITY_IMPLEMENTATION_MAP.md",
  "../UNITY_UI_HANDOFF.md",
  "../RESPONSIVE_UI_SPEC.md",
  "../RESPONSIVE_UI_QA.md",
  "../TEXT_STYLE_AUDIT.md",
  "../MISSION_LIBRARY_SPEC.md",
  "../MISSION_MODE_SPEC.md",
  "../TRAINING_MODE_SPEC.md",
  "../SURVIVAL_4_OPERATION_SPEC.md",
  "../MISSION_CLEARABILITY_REPORT.md",
] as const;

const missionCounts = {
  total: MISSION_LIBRARY.length,
  standard: MISSION_LIBRARY.filter((mission) => mission.category === "standard").length,
  archive: MISSION_LIBRARY.filter((mission) => mission.category === "archive").length,
  extreme: MISSION_LIBRARY.filter((mission) => mission.category === "extreme").length,
};

const runtimePayload = {
  schema: "deep-blue-grid.unity-content",
  schemaVersion: 2,
  sourceRef: SOURCE_REF,
  distribution: "runtime-safe",
  validationSolutionsIncluded: false,
  coordinateContract: {
    gridSize: GRID_SIZE,
    cellLabels: CELL_LABELS,
    origin: "top-left",
    displayExample: { label: "A-1", coord: { x: 0, y: 0 } },
    orientations: ORIENTATIONS,
    rotationOrder: ORIENTATIONS,
  },
  rules: {
    echo: { mode: ECHO_MODE, directions: ECHO_DIRECTIONS },
    aiModes: AI_MODE_CONTRACT,
    gameModes: MODE_RULE_CONTRACT,
    silentProfile: SILENT_PROFILE_CONTRACT,
    submarineWake: SUBMARINE_WAKE_CONTRACT,
    seededRandom: SEEDED_RANDOM_CONTRACT,
    formationSupport: FORMATION_SUPPORT_CONTRACT,
  },
  fleets: {
    standard: STANDARD_FLEET,
    full: FULL_FLEET,
  },
  shipDefinitions: SHIPS,
  weapons: {
    maximumUses: WEAPON_MAX,
    patterns: {
      harpoon: HARPOON_PATTERN,
      radar: RADAR_PATTERN,
      straddle: STRADDLE_PATTERN,
    },
  },
  presentation: {
    weaponSystems: WEAPON_PRESENTATION,
    actionLabels: ACTION_LABEL,
    commonText: UI_TEXT_CATALOG,
    shipDossiers: SHIP_DOSSIER,
    lostCapabilities: LOST_CAPABILITY,
    missionDifficultyNames: MISSION_DIFFICULTY_NAME,
    timingsMs: PRESENTATION_TIMINGS_MS,
    responsiveUi: RESPONSIVE_UI_CONTRACT,
    cicMaterial: CIC_MATERIAL_CONTRACT,
  },
  audio: AUDIO_CUE_CONTRACT,
  contentCounts: {
    casualStages: STAGES.length,
    tacticsStages: STAGES.length,
    survivalStages: SURVIVAL_STAGES.length,
    missions: missionCounts,
    trainingStages: TRAINING_STAGES.length,
  },
  campaignStages: STAGES,
  survivalStages: SURVIVAL_STAGES,
  missions: MISSION_LIBRARY,
  trainingStages: TRAINING_STAGES,
  persistence: {
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
  },
} as const;

const validationPayload = {
  schema: "deep-blue-grid.unity-validation",
  schemaVersion: 1,
  sourceRef: SOURCE_REF,
  distribution: "editor-test-only",
  excludeFromPlayerBuild: true,
  warning: "Contains complete mission solutions. Keep outside runtime Resources, Addressables and StreamingAssets.",
  missionCount: MISSION_LIBRARY.length,
  canonicalMissionRoutes: CANONICAL_MISSION_ROUTES,
} as const;

const checksumTargets = [
  "unity-content-v2.json",
  "unity-validation-v1.json",
  "manifest.json",
  ...handoffDocumentation,
  ...visualReferences,
  "../../public/og.png",
] as const;

const manifest = {
  schema: "deep-blue-grid.unity-handoff",
  schemaVersion: 2,
  sourceRepository: "https://github.com/spthx/deep-blue-grid",
  sourceBranch: "master",
  sourceRef: SOURCE_REF,
  publicReferenceUrl: "https://spthx.github.io/deep-blue-grid/",
  primaryContent: "unity-content-v2.json",
  editorValidationFixture: "unity-validation-v1.json",
  runtimeExclusions: ["unity-validation-v1.json"],
  checksums: "SHA256SUMS.txt",
  checksumCanonicalization: {
    textLineEndings: "LF",
    binary: "raw-bytes",
  },
  checksumTargets,
  generator: "../../scripts/export-unity-content.ts",
  contractSources: [
    "../../app/game/constants.ts",
    "../../app/game/Campaign.ts",
    "../../app/game/EnemyAI.ts",
    "../../app/game/SubmarineWake.ts",
    "../../app/game/engine.ts",
    "../../app/game/PresentationContract.ts",
    "../../app/game/AudioManager.ts",
  ],
  documentation: handoffDocumentation,
  visualReferences,
  staticGameArt: [],
  socialArtwork: [{ path: "../../public/og.png", useInGame: false }],
  runtimeGeneratedPresentation: {
    visualSource: [
      "../../app/game/Renderer.ts",
      "../../app/globals.css",
      "../../app/game/PresentationContract.ts",
    ],
    audioSource: "../../app/game/AudioManager.ts",
    externalAudioFiles: [],
  },
  fonts: {
    binariesIncluded: false,
    acquireAtUnityIntegration: [
      "BIZ UDPGothic Regular/Bold",
      "IBM Plex Mono Medium/SemiBold",
      "Noto Sans JP fallback",
    ],
    licenseContract: "../UNITY_UI_HANDOFF.md",
  },
  validation: [
    "npm run export:unity",
    "npm test",
    "npm run build:pages",
    "npm run measure:missions -- 100",
  ],
} as const;

const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const checksumPayload = (path: string, contents: Buffer) =>
  /\.(?:json|md|txt)$/i.test(path)
    ? Buffer.from(contents.toString("utf8").replace(/\r\n?/g, "\n"), "utf8")
    : contents;

await mkdir(dirname(runtimeOutputPath), { recursive: true });
await writeFile(runtimeOutputPath, serialize(runtimePayload), "utf8");
await writeFile(validationOutputPath, serialize(validationPayload), "utf8");
await writeFile(manifestOutputPath, serialize(manifest), "utf8");
await rm(resolve(handoffDirectory, "unity-content-v1.json"), { force: true });

const checksumLines: string[] = [];
for (const relativePath of checksumTargets) {
  const absolutePath = resolve(handoffDirectory, relativePath);
  const contents = await readFile(absolutePath);
  const checksum = createHash("sha256").update(checksumPayload(relativePath, contents)).digest("hex");
  const repositoryPath = absolutePath.slice(resolve(".").length + 1).replaceAll("\\", "/");
  checksumLines.push(`${checksum}  ${repositoryPath}`);
}
await writeFile(checksumsOutputPath, `${checksumLines.join("\n")}\n`, "utf8");

console.log(`Unity runtime content written: ${runtimeOutputPath}`);
console.log(`Unity editor validation fixture written: ${validationOutputPath}`);
console.log(`Unity handoff manifest and ${checksumLines.length} checksums regenerated.`);
