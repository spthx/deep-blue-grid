import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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

const outputPath = resolve("docs/unity-handoff/unity-content-v1.json");

const missionCounts = {
  total: MISSION_LIBRARY.length,
  standard: MISSION_LIBRARY.filter((mission) => mission.category === "standard").length,
  archive: MISSION_LIBRARY.filter((mission) => mission.category === "archive").length,
  extreme: MISSION_LIBRARY.filter((mission) => mission.category === "extreme").length,
};

const payload = {
  schema: "deep-blue-grid.unity-content",
  schemaVersion: 1,
  sourceRef: "unity-handoff-2026-08-08",
  coordinateContract: {
    gridSize: GRID_SIZE,
    cellLabels: CELL_LABELS,
    origin: "top-left",
    displayExample: { label: "A-1", coord: { x: 0, y: 0 } },
    orientations: ORIENTATIONS,
    rotationOrder: ORIENTATIONS,
  },
  echo: {
    mode: ECHO_MODE,
    directions: ECHO_DIRECTIONS,
  },
  fleets: {
    standard: STANDARD_FLEET,
    full: FULL_FLEET,
  },
  shipDefinitions: SHIPS,
  weapons: {
    maximumUses: WEAPON_MAX,
    harpoonPattern: HARPOON_PATTERN,
  },
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
  },
} as const;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Unity content export written: ${outputPath}`);
