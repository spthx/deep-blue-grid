export const MISSION_RECORDS_VERSION = 1 as const;
export const MISSION_RECORDS_STORAGE_KEY = "deep-blue-grid.mission-records";

export type MissionIdentifier = string | number;

export type MissionRunRecord = Readonly<{
  commands: number;
  activeMs: number;
}>;

export type MissionBestRecord = Readonly<{
  missionId: string;
  /** 指令数を優先し、同数なら活動時間で選んだ総合記録。 */
  bestRun: MissionRunRecord;
  /** 活動時間にかかわらない最少指令数。 */
  fewestCommands: number;
  /** 指令数にかかわらない最短活動時間。 */
  fastestActiveMs: number;
  /** この端末で任務を達成した回数。 */
  clearCount: number;
  /** この端末で初めて達成した日時。取得不能の場合だけ null。 */
  firstClearedAt: string | null;
}>;

export type MissionRecordBook = Readonly<{
  version: typeof MISSION_RECORDS_VERSION;
  missions: readonly MissionBestRecord[];
}>;

export type MissionResult = Readonly<{
  missionId: MissionIdentifier;
  result: "victory" | "defeat";
  commands: number;
  activeMs: number;
  /** ISO 8601。純粋更新関数を直接使う場合に呼出側から渡す。 */
  completedAt?: string;
}>;

export type MissionRecordUpdate = Readonly<{
  records: MissionRecordBook;
  changed: boolean;
  bestRunImproved: boolean;
  fewestCommandsImproved: boolean;
  fastestTimeImproved: boolean;
  firstClear: boolean;
}>;

export type StoredMissionRecordUpdate = MissionRecordUpdate & Readonly<{
  /** 更新なし、または更新内容を保存できた場合に true。 */
  persisted: boolean;
}>;

/** localStorage とテスト用インメモリ保存先の共通最小インターフェース。 */
export type MissionRecordStorage = Pick<Storage, "getItem" | "setItem">;

type UnknownRecord = Record<string, unknown>;

export function createEmptyMissionRecords(): MissionRecordBook {
  return { version: MISSION_RECORDS_VERSION, missions: [] };
}

/**
 * 指令数を最優先し、同手なら活動時間の短い攻略を上位とする。
 * 負数は left が優秀、正数は right が優秀、0 は同記録。
 */
export function compareMissionRuns(left: MissionRunRecord, right: MissionRunRecord) {
  if (left.commands !== right.commands) return left.commands < right.commands ? -1 : 1;
  if (left.activeMs !== right.activeMs) return left.activeMs < right.activeMs ? -1 : 1;
  return 0;
}

export function findMissionRecord(records: MissionRecordBook, missionId: MissionIdentifier) {
  const key = normalizeMissionId(missionId);
  if (key === null) return null;
  return records.missions.find((record) => record.missionId === key) ?? null;
}

/** 勝利だけを、不変データとして記録へ反映する純粋関数。 */
export function applyMissionResult(records: MissionRecordBook, result: MissionResult): MissionRecordUpdate {
  const unchanged = (book = records): MissionRecordUpdate => ({
    records: book,
    changed: false,
    bestRunImproved: false,
    fewestCommandsImproved: false,
    fastestTimeImproved: false,
    firstClear: false,
  });

  if (result.result !== "victory") return unchanged();

  const missionId = normalizeMissionId(result.missionId);
  const run = normalizeRun(result);
  if (missionId === null || run === null) return unchanged();

  const index = records.missions.findIndex((record) => record.missionId === missionId);
  const previous = index < 0 ? null : records.missions[index];
  const bestRunImproved = previous === null || compareMissionRuns(run, previous.bestRun) < 0;
  const fewestCommandsImproved = previous === null || run.commands < previous.fewestCommands;
  const fastestTimeImproved = previous === null || run.activeMs < previous.fastestActiveMs;
  const completedAt = normalizeCompletedAt(result.completedAt);

  const nextRecord: MissionBestRecord = {
    missionId,
    bestRun: bestRunImproved ? run : previous!.bestRun,
    fewestCommands: fewestCommandsImproved ? run.commands : previous!.fewestCommands,
    fastestActiveMs: fastestTimeImproved ? run.activeMs : previous!.fastestActiveMs,
    clearCount: previous === null ? 1 : Math.min(Number.MAX_SAFE_INTEGER, previous.clearCount + 1),
    firstClearedAt: previous?.firstClearedAt ?? completedAt,
  };
  const missions = [...records.missions];
  if (index < 0) missions.push(nextRecord);
  else missions[index] = nextRecord;

  return {
    records: { version: MISSION_RECORDS_VERSION, missions },
    changed: true,
    bestRunImproved,
    fewestCommandsImproved,
    fastestTimeImproved,
    firstClear: previous === null,
  };
}

/** 同一バージョンの有効な記録だけを復元する。破損データは空記録へ戻す。 */
export function parseMissionRecords(serialized: string | null): MissionRecordBook {
  if (!serialized) return createEmptyMissionRecords();
  try {
    const source: unknown = JSON.parse(serialized);
    if (!isObject(source) || source.version !== MISSION_RECORDS_VERSION || !Array.isArray(source.missions)) {
      return createEmptyMissionRecords();
    }

    const missions: MissionBestRecord[] = [];
    const indices = new Map<string, number>();
    for (const candidate of source.missions) {
      const decoded = decodeMissionRecord(candidate);
      if (decoded === null) continue;
      const duplicateIndex = indices.get(decoded.missionId);
      if (duplicateIndex === undefined) {
        indices.set(decoded.missionId, missions.length);
        missions.push(decoded);
        continue;
      }
      missions[duplicateIndex] = mergeMissionRecords(missions[duplicateIndex], decoded);
    }
    return { version: MISSION_RECORDS_VERSION, missions };
  } catch {
    return createEmptyMissionRecords();
  }
}

/** SSR、プライベートモード、無効化されたストレージでも例外を外へ出さない。 */
export function loadMissionRecords(storage: MissionRecordStorage | null = browserStorage()): MissionRecordBook {
  if (storage === null) return createEmptyMissionRecords();
  try {
    return parseMissionRecords(storage.getItem(MISSION_RECORDS_STORAGE_KEY));
  } catch {
    return createEmptyMissionRecords();
  }
}

export function saveMissionRecords(
  records: MissionRecordBook,
  storage: MissionRecordStorage | null = browserStorage(),
) {
  if (storage === null) return false;
  try {
    storage.setItem(MISSION_RECORDS_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

/** 読込・比較・保存を一度に行い、UIへ更新内容も返す。 */
export function updateStoredMissionResult(
  result: MissionResult,
  storage: MissionRecordStorage | null = browserStorage(),
  now: () => Date = () => new Date(),
): StoredMissionRecordUpdate {
  const completedResult = result.result === "victory" && result.completedAt === undefined
    ? { ...result, completedAt: now().toISOString() }
    : result;
  const update = applyMissionResult(loadMissionRecords(storage), completedResult);
  return {
    ...update,
    persisted: !update.changed || saveMissionRecords(update.records, storage),
  };
}

function browserStorage(): MissionRecordStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function normalizeMissionId(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  const missionId = String(value).trim();
  return missionId.length > 0 && missionId.length <= 128 ? missionId : null;
}

function normalizeRun(value: { commands: unknown; activeMs: unknown }): MissionRunRecord | null {
  if (typeof value.commands !== "number" || !Number.isSafeInteger(value.commands) || value.commands < 0) return null;
  if (typeof value.activeMs !== "number" || !Number.isFinite(value.activeMs) || value.activeMs < 0) return null;
  const activeMs = Math.round(value.activeMs);
  if (!Number.isSafeInteger(activeMs)) return null;
  return { commands: value.commands, activeMs };
}

function decodeMissionRecord(value: unknown): MissionBestRecord | null {
  if (!isObject(value)) return null;
  const missionId = normalizeMissionId(value.missionId);
  if (missionId === null || !isObject(value.bestRun)) return null;
  const bestRun = normalizeRun({ commands: value.bestRun.commands, activeMs: value.bestRun.activeMs });
  if (bestRun === null) return null;

  const fewestCommands = normalizeNonNegativeInteger(value.fewestCommands) ?? bestRun.commands;
  const fastestActiveMs = normalizeNonNegativeInteger(value.fastestActiveMs) ?? bestRun.activeMs;
  const clearCount = normalizePositiveInteger(value.clearCount) ?? 1;
  return {
    missionId,
    bestRun,
    fewestCommands: Math.min(fewestCommands, bestRun.commands),
    fastestActiveMs: Math.min(fastestActiveMs, bestRun.activeMs),
    clearCount,
    firstClearedAt: normalizeCompletedAt(value.firstClearedAt),
  };
}

function mergeMissionRecords(left: MissionBestRecord, right: MissionBestRecord): MissionBestRecord {
  return {
    missionId: left.missionId,
    bestRun: compareMissionRuns(left.bestRun, right.bestRun) <= 0 ? left.bestRun : right.bestRun,
    fewestCommands: Math.min(left.fewestCommands, right.fewestCommands),
    fastestActiveMs: Math.min(left.fastestActiveMs, right.fastestActiveMs),
    clearCount: Math.max(left.clearCount, right.clearCount),
    firstClearedAt: earliestTimestamp(left.firstClearedAt, right.firstClearedAt),
  };
}

function normalizeNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizePositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function normalizeCompletedAt(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function earliestTimestamp(left: string | null, right: string | null) {
  if (left === null) return right;
  if (right === null) return left;
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
