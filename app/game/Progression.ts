import type { GameMode, MissionStageDefinition } from "./Campaign.ts";
import { findMissionRecord, type MissionRecordBook } from "./MissionRecords.ts";
import type { TrainingProgress } from "./TrainingProgress.ts";

export const PROGRESSION_VERSION = 2 as const;
export const PROGRESSION_STORAGE_KEY = "deep-blue-grid.progression";
export const MODE_ROUTE = ["training", "casual", "tactics", "mission", "survival"] as const;
export const MISSION_QUALIFICATION_DIFFICULTIES = [1, 2, 3, 4, 5] as const;
export const PROGRESSION_HANDOFF_CONTRACT = {
  route: MODE_ROUTE,
  access: { policyRevision: "2026-10-13-open-access", allModesFromFirstLaunch: true, tutorialOptional: true, allLessonsSelectable: true, allMissionCategoriesSelectable: true },
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
  extremeAuthorization: "available from first launch; no prerequisite",
  debug: { query: "?debug=all", runtimeOnly: true, saveWrites: false, visibleBanner: true },
  persistence: {
    legacyEvidenceRecovery: "preserve known completion records; never infer other mode clears from a mission record",
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
export type ModeCompletionCommit = Readonly<{
  progression: ProgressionState;
  changed: boolean;
  persisted: boolean;
  wrote: boolean;
  writeProtected: boolean;
}>;

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
    if (!isObject(value) || (value.version !== 1 && value.version !== PROGRESSION_VERSION) || !Array.isArray(value.completedModes)) {
      return createEmptyProgression();
    }
    const requested = new Set(value.completedModes.filter(isProgressionMode));
    const completedModes: ProgressionMode[] = [];
    for (const mode of MODE_ROUTE) {
      // V1 stored a contiguous unlock route; V2 stores independent clear records.
      if (!requested.has(mode) && value.version === 1) break;
      if (requested.has(mode)) completedModes.push(mode);
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
    return (value.version === 1 || value.version === PROGRESSION_VERSION) && Array.isArray(value.completedModes) ? "current" : "invalid";
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
  return {
    version: PROGRESSION_VERSION,
    completedModes: MODE_ROUTE.filter((candidate) => progression.completedModes.includes(candidate) || candidate === mode),
  };
}

export function modeAccess(progression: ProgressionState, mode: ProgressionMode, debugAll = false): ModeAccess {
  const complete = progression.completedModes.includes(mode);
  if (debugAll && !complete) return { mode, state: "debug", allowed: true, requirement: "DEBUG AUTHORIZATION：通常の解放記録は変更しません。" };
  if (complete) return { mode, state: "completed", allowed: true, requirement: completionLabel(mode) };
  return { mode, state: "available", allowed: true, requirement: availableLabel(mode) };
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
  // Keep the client signature; records no longer gate any valid lesson.
  void progress;
  void debugAll;
  return sequence.includes(lesson);
}

export function migrateLegacyProgression(evidence: LegacyProgressionEvidence): ProgressionState {
  const completedModes: ProgressionMode[] = [];
  // A mission can now be played first. Its mere existence is not evidence that
  // training, CASUAL or TACTICS was completed. Restore only verifiable clears.
  if (evidence.trainingComplete) completedModes.push("training");
  if (evidence.missionQualified) completedModes.push("mission");
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
      return { version: PROGRESSION_VERSION, completedModes: MODE_ROUTE.filter((mode) => current.completedModes.includes(mode) || recovered.completedModes.includes(mode)) };
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
  options: Readonly<{ write?: boolean }> = {},
) {
  const previous = loadProgression(storage);
  return commitModeCompletion(previous, mode, storage, options);
}

/**
 * A mode-clear transaction.  The in-memory authorization and its single
 * durable write are decided together so repeated result callbacks cannot
 * incrementally rewrite the same completion.  Debug callers pass
 * `{ write:false }`, which deliberately changes neither memory nor storage.
 */
export function commitModeCompletion(
  previous: ProgressionState,
  mode: GameMode,
  storage: ProgressionStorage | null = browserStorage(),
  options: Readonly<{ write?: boolean }> = {},
): ModeCompletionCommit {
  if (options.write === false) {
    return { progression: previous, changed: false, persisted: true, wrote: false, writeProtected: false };
  }

  const progression = completeMode(previous, mode);
  if (progression === previous) {
    return { progression, changed: false, persisted: true, wrote: false, writeProtected: false };
  }

  if (storage !== null) {
    try {
      if (progressionSerializedStatus(storage.getItem(PROGRESSION_STORAGE_KEY)) === "future") {
        return { progression, changed: true, persisted: false, wrote: false, writeProtected: true };
      }
    } catch {
      return { progression, changed: true, persisted: false, wrote: false, writeProtected: false };
    }
  }

  const persisted = saveProgression(progression, storage);
  return { progression, changed: true, persisted, wrote: persisted, writeProtected: false };
}

export function debugUnlockAllFromSearch(search: string) {
  try {
    return new URLSearchParams(search).get("debug") === "all";
  } catch {
    return false;
  }
}

function completionLabel(mode: ProgressionMode) {
  if (mode === "training") return "全教程修了。いつでも再受講できます。";
  if (mode === "casual" || mode === "tactics") return "全6海域確保。いつでも再出撃できます。";
  if (mode === "mission") return "戦術・記録の達成印6件取得。";
  return "全4作戦完遂。いつでも再出撃できます。";
}

function availableLabel(mode: ProgressionMode) {
  if (mode === "training") return "任意の教材です。受講せずゲームを始められます。";
  if (mode === "casual") return "初めてのゲームはこちらがおすすめです。";
  if (mode === "tactics") return "最初から出撃可能。情報を絞った実戦モードです。";
  if (mode === "mission") return "戦術・記録・極限の全28任務を自由に選べます。";
  return "最初から出撃可能。残存艦隊で4作戦に挑みます。";
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
