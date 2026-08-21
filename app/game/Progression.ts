import type { GameMode, MissionStageDefinition } from "./Campaign.ts";
import { findMissionRecord, type MissionRecordBook } from "./MissionRecords.ts";
import type { TrainingProgress } from "./TrainingProgress.ts";

export const PROGRESSION_VERSION = 1 as const;
export const PROGRESSION_STORAGE_KEY = "deep-blue-grid.progression";
export const MODE_ROUTE = ["training", "casual", "tactics", "mission", "survival"] as const;
export const MISSION_QUALIFICATION_DIFFICULTIES = [1, 2, 3, 4, 5] as const;
export const PROGRESSION_HANDOFF_CONTRACT = {
  route: MODE_ROUTE,
  completionRequirements: {
    training: "complete all nine lessons",
    casual: "secure all six sectors",
    tactics: "secure all six sectors",
    mission: "clear one standard mission at each difficulty 1-5 and one archive mission",
    survival: "complete all four operations",
  },
  missionQualification: {
    standardDifficulties: MISSION_QUALIFICATION_DIFFICULTIES,
    archiveMarks: 1,
    totalMarks: 6,
  },
  extremeAuthorization: "complete survival",
  debug: { query: "?debug=all", runtimeOnly: true, saveWrites: false, visibleBanner: true },
  persistence: {
    legacyEvidenceRecovery: "prefer the longer contiguous authorization prefix",
    futureVersionWriteProtection: true,
    writeFailureAlert: "LOCAL RECORD NOT SAVED",
  },
} as const;

export type ProgressionMode = typeof MODE_ROUTE[number];
export type ProgressionState = Readonly<{
  version: typeof PROGRESSION_VERSION;
  completedModes: readonly ProgressionMode[];
}>;
export type ProgressionStorage = Pick<Storage, "getItem" | "setItem">;
export type LegacyProgressionEvidence = Readonly<{
  trainingComplete: boolean;
  hasMissionRecord: boolean;
  missionQualified: boolean;
}>;
export type ModeAccess = Readonly<{
  mode: ProgressionMode;
  state: "completed" | "available" | "locked" | "debug";
  allowed: boolean;
  requirement: string;
}>;
export type MissionQualificationMark = Readonly<{
  key: string;
  label: string;
  complete: boolean;
}>;
export type ProgressionSerializedStatus = "missing" | "current" | "invalid" | "future";

export function createEmptyProgression(): ProgressionState {
  return { version: PROGRESSION_VERSION, completedModes: [] };
}

export function createGrandfatheredProgression(): ProgressionState {
  return { version: PROGRESSION_VERSION, completedModes: [...MODE_ROUTE] };
}

export function parseProgression(serialized: string | null): ProgressionState {
  if (!serialized) return createEmptyProgression();
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isObject(value) || value.version !== PROGRESSION_VERSION || !Array.isArray(value.completedModes)) {
      return createEmptyProgression();
    }
    const requested = new Set(value.completedModes.filter(isProgressionMode));
    const completedModes: ProgressionMode[] = [];
    for (const mode of MODE_ROUTE) {
      if (!requested.has(mode)) break;
      completedModes.push(mode);
    }
    return { version: PROGRESSION_VERSION, completedModes };
  } catch {
    return createEmptyProgression();
  }
}

export function progressionSerializedStatus(serialized: string | null): ProgressionSerializedStatus {
  if (serialized === null) return "missing";
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isObject(value)) return "invalid";
    if (typeof value.version === "number" && value.version > PROGRESSION_VERSION) return "future";
    return value.version === PROGRESSION_VERSION && Array.isArray(value.completedModes) ? "current" : "invalid";
  } catch {
    return "invalid";
  }
}

export function serializeProgression(progression: ProgressionState) {
  return JSON.stringify({
    version: PROGRESSION_VERSION,
    completedModes: MODE_ROUTE.filter((mode) => progression.completedModes.includes(mode)),
  });
}

export function completeMode(progression: ProgressionState, mode: GameMode): ProgressionState {
  if (!isProgressionMode(mode) || progression.completedModes.includes(mode)) return progression;
  const routeIndex = MODE_ROUTE.indexOf(mode);
  const prerequisite = routeIndex > 0 ? MODE_ROUTE[routeIndex - 1] : null;
  if (prerequisite && !progression.completedModes.includes(prerequisite)) return progression;
  return {
    version: PROGRESSION_VERSION,
    completedModes: MODE_ROUTE.filter((candidate) => progression.completedModes.includes(candidate) || candidate === mode),
  };
}

export function modeAccess(progression: ProgressionState, mode: ProgressionMode, debugAll = false): ModeAccess {
  const complete = progression.completedModes.includes(mode);
  if (debugAll && !complete) return { mode, state: "debug", allowed: true, requirement: "DEBUG AUTHORIZATION：通常の解放記録は変更しません。" };
  if (complete) return { mode, state: "completed", allowed: true, requirement: completionLabel(mode) };
  const index = MODE_ROUTE.indexOf(mode);
  const prerequisite = index > 0 ? MODE_ROUTE[index - 1] : null;
  if (prerequisite === null || progression.completedModes.includes(prerequisite)) {
    return { mode, state: "available", allowed: true, requirement: availableLabel(mode) };
  }
  return { mode, state: "locked", allowed: false, requirement: lockedLabel(prerequisite) };
}

export function missionQualificationMarks(
  records: MissionRecordBook,
  library: readonly MissionStageDefinition[],
): MissionQualificationMark[] {
  const marks = MISSION_QUALIFICATION_DIFFICULTIES.map((difficulty) => ({
    key: `standard-${difficulty}`,
    label: `TACTICAL D${difficulty}`,
    complete: library.some((mission) => mission.category === "standard"
      && mission.difficulty === difficulty
      && findMissionRecord(records, mission.id) !== null),
  }));
  marks.push({
    key: "archive",
    label: "ARCHIVE",
    complete: library.some((mission) => mission.category === "archive" && findMissionRecord(records, mission.id) !== null),
  });
  return marks;
}

export function missionQualificationComplete(records: MissionRecordBook, library: readonly MissionStageDefinition[]) {
  return missionQualificationMarks(records, library).every((mark) => mark.complete);
}

export function missionQualificationCount(records: MissionRecordBook, library: readonly MissionStageDefinition[]) {
  return missionQualificationMarks(records, library).filter((mark) => mark.complete).length;
}

export function isTrainingLessonUnlocked(
  progress: TrainingProgress,
  lesson: number,
  sequence: readonly number[],
  debugAll = false,
) {
  if (debugAll || progress.completedLessons.some((completed) => completed === lesson)) return true;
  const index = sequence.indexOf(lesson);
  if (index < 0) return false;
  return sequence
    .slice(0, index)
    .every((requiredLesson) => progress.completedLessons.some((completed) => completed === requiredLesson));
}

export function migrateLegacyProgression(evidence: LegacyProgressionEvidence): ProgressionState {
  const completedModes: ProgressionMode[] = [];
  if (evidence.trainingComplete || evidence.hasMissionRecord) completedModes.push("training");
  if (evidence.hasMissionRecord) completedModes.push("casual", "tactics");
  if (evidence.hasMissionRecord && evidence.missionQualified) completedModes.push("mission");
  return { version: PROGRESSION_VERSION, completedModes };
}

export function loadProgression(
  storage: ProgressionStorage | null = browserStorage(),
  legacyEvidence?: LegacyProgressionEvidence,
): ProgressionState {
  if (storage === null) return createEmptyProgression();
  try {
    const serialized = storage.getItem(PROGRESSION_STORAGE_KEY);
    const status = progressionSerializedStatus(serialized);
    if (status === "current") {
      const current = parseProgression(serialized);
      if (!legacyEvidence) return current;
      const recovered = migrateLegacyProgression(legacyEvidence);
      return recovered.completedModes.length > current.completedModes.length ? recovered : current;
    }
    return legacyEvidence ? migrateLegacyProgression(legacyEvidence) : createEmptyProgression();
  } catch {
    return createEmptyProgression();
  }
}

export function saveProgression(
  progression: ProgressionState,
  storage: ProgressionStorage | null = browserStorage(),
) {
  if (storage === null) return false;
  try {
    storage.setItem(PROGRESSION_STORAGE_KEY, serializeProgression(progression));
    return true;
  } catch {
    return false;
  }
}

export function updateStoredModeCompletion(
  mode: GameMode,
  storage: ProgressionStorage | null = browserStorage(),
) {
  const previous = loadProgression(storage);
  const progression = completeMode(previous, mode);
  return {
    progression,
    changed: progression !== previous,
    persisted: progression === previous || saveProgression(progression, storage),
  };
}

export function debugUnlockAllFromSearch(search: string) {
  try {
    return new URLSearchParams(search).get("debug") === "all";
  } catch {
    return false;
  }
}

function completionLabel(mode: ProgressionMode) {
  if (mode === "training") return "全教程修了。CASUAL作戦権限付与済み。";
  if (mode === "casual") return "全6海域確保。TACTICS作戦権限付与済み。";
  if (mode === "tactics") return "全6海域確保。MISSION作戦権限付与済み。";
  if (mode === "mission") return "認定印6件取得。SURVIVAL作戦権限付与済み。";
  return "全4作戦完遂。全作戦権限付与済み。";
}

function availableLabel(mode: ProgressionMode) {
  if (mode === "training") return "初任者はここから開始。全教程修了でCASUALを解放。";
  if (mode === "casual") return "全6海域確保でTACTICSを解放。";
  if (mode === "tactics") return "全6海域確保でMISSIONを解放。";
  if (mode === "mission") return "認定印6件取得でSURVIVALを解放。";
  return "全4作戦を残存艦隊で完遂せよ。";
}

function lockedLabel(prerequisite: ProgressionMode) {
  if (prerequisite === "training") return "解放条件：INITIAL TRAINING 全教程修了。";
  if (prerequisite === "casual") return "解放条件：CASUAL 全6海域確保。";
  if (prerequisite === "tactics") return "解放条件：TACTICS 全6海域確保。";
  return "解放条件：MISSION認定印6件取得。";
}

function isProgressionMode(value: unknown): value is ProgressionMode {
  return typeof value === "string" && MODE_ROUTE.includes(value as ProgressionMode);
}

function browserStorage(): ProgressionStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
