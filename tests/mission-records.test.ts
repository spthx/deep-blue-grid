import assert from "node:assert/strict";
import test from "node:test";
import {
  MISSION_RECORDS_STORAGE_KEY,
  MISSION_RECORDS_VERSION,
  applyMissionResult,
  compareMissionRuns,
  createEmptyMissionRecords,
  findMissionRecord,
  loadMissionRecords,
  parseMissionRecords,
  saveMissionRecords,
  updateStoredMissionResult,
  type MissionRecordStorage,
} from "../app/game/MissionRecords.ts";

class MemoryStorage implements MissionRecordStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("mission run comparison prioritizes commands, then active time", () => {
  assert.equal(compareMissionRuns({ commands: 2, activeMs: 90_000 }, { commands: 3, activeMs: 1_000 }), -1);
  assert.equal(compareMissionRuns({ commands: 3, activeMs: 1_000 }, { commands: 2, activeMs: 90_000 }), 1);
  assert.equal(compareMissionRuns({ commands: 2, activeMs: 20_000 }, { commands: 2, activeMs: 21_000 }), -1);
  assert.equal(compareMissionRuns({ commands: 2, activeMs: 20_000 }, { commands: 2, activeMs: 20_000 }), 0);
});

test("defeats never create or alter a best record", () => {
  const empty = createEmptyMissionRecords();
  const update = applyMissionResult(empty, {
    missionId: 1,
    result: "defeat",
    commands: 1,
    activeMs: 500,
  });
  assert.equal(update.changed, false);
  assert.equal(update.records, empty);
  assert.equal(findMissionRecord(update.records, 1), null);
});

test("victories retain a ranked best run and independent metric bests", () => {
  let records = createEmptyMissionRecords();
  records = applyMissionResult(records, {
    missionId: "narrow-gate",
    result: "victory",
    commands: 5,
    activeMs: 1_000,
  }).records;
  records = applyMissionResult(records, {
    missionId: "narrow-gate",
    result: "victory",
    commands: 4,
    activeMs: 5_000,
  }).records;
  records = applyMissionResult(records, {
    missionId: "narrow-gate",
    result: "victory",
    commands: 4,
    activeMs: 4_000,
  }).records;
  const fastestOnly = applyMissionResult(records, {
    missionId: "narrow-gate",
    result: "victory",
    commands: 6,
    activeMs: 500,
  });

  assert.equal(fastestOnly.changed, true);
  assert.equal(fastestOnly.bestRunImproved, false);
  assert.equal(fastestOnly.fewestCommandsImproved, false);
  assert.equal(fastestOnly.fastestTimeImproved, true);
  assert.deepEqual(findMissionRecord(fastestOnly.records, "narrow-gate"), {
    missionId: "narrow-gate",
    bestRun: { commands: 4, activeMs: 4_000 },
    fewestCommands: 4,
    fastestActiveMs: 500,
    clearCount: 4,
    firstClearedAt: null,
  });
});

test("record updates are immutable and every victory increments clear count", () => {
  const original = applyMissionResult(createEmptyMissionRecords(), {
    missionId: 2,
    result: "victory",
    commands: 2,
    activeMs: 20_000,
  }).records;
  const previousMission = original.missions[0];
  const slower = applyMissionResult(original, {
    missionId: 2,
    result: "victory",
    commands: 3,
    activeMs: 30_000,
  });

  assert.equal(slower.changed, true);
  assert.notEqual(slower.records, original);
  assert.notEqual(slower.records.missions[0], previousMission);
  assert.equal(slower.records.missions[0].clearCount, 2);
  assert.equal(slower.bestRunImproved, false);
  assert.equal(slower.fastestTimeImproved, false);
});

test("records round-trip through a storage-compatible object", () => {
  const storage = new MemoryStorage();
  const update = updateStoredMissionResult({
    missionId: 3,
    result: "victory",
    commands: 2,
    activeMs: 12_345.4,
  }, storage, () => new Date("2026-08-01T03:04:05.000Z"));

  assert.equal(update.persisted, true);
  assert.ok(storage.values.has(MISSION_RECORDS_STORAGE_KEY));
  assert.deepEqual(loadMissionRecords(storage), update.records);
  assert.deepEqual(findMissionRecord(update.records, "3"), {
    missionId: "3",
    bestRun: { commands: 2, activeMs: 12_345 },
    fewestCommands: 2,
    fastestActiveMs: 12_345,
    clearCount: 1,
    firstClearedAt: "2026-08-01T03:04:05.000Z",
  });
});

test("first clear timestamp is retained while later victories increment the count", () => {
  const first = applyMissionResult(createEmptyMissionRecords(), {
    missionId: 4,
    result: "victory",
    commands: 3,
    activeMs: 30_000,
    completedAt: "2026-08-01T12:00:00+09:00",
  });
  const second = applyMissionResult(first.records, {
    missionId: 4,
    result: "victory",
    commands: 2,
    activeMs: 20_000,
    completedAt: "2026-08-02T12:00:00+09:00",
  });

  assert.equal(first.firstClear, true);
  assert.equal(second.firstClear, false);
  assert.equal(second.records.missions[0].clearCount, 2);
  assert.equal(second.records.missions[0].firstClearedAt, "2026-08-01T03:00:00.000Z");
});

test("all twenty-eight freely selected missions keep independent records", () => {
  let records = createEmptyMissionRecords();
  for (let missionId = 28; missionId >= 1; missionId -= 1) {
    records = applyMissionResult(records, {
      missionId,
      result: "victory",
      commands: missionId,
      activeMs: missionId * 1_000,
      completedAt: `2026-08-${String(missionId).padStart(2, "0")}T00:00:00.000Z`,
    }).records;
  }

  assert.equal(records.missions.length, 28);
  for (let missionId = 1; missionId <= 28; missionId += 1) {
    assert.equal(findMissionRecord(records, missionId)?.fewestCommands, missionId);
  }
});

test("malformed JSON and unsupported versions safely reset to empty records", () => {
  assert.deepEqual(parseMissionRecords("{broken"), createEmptyMissionRecords());
  assert.deepEqual(parseMissionRecords(JSON.stringify({
    version: MISSION_RECORDS_VERSION + 1,
    missions: [{ missionId: "1", bestRun: { commands: 1, activeMs: 1 } }],
  })), createEmptyMissionRecords());
});

test("same-version parsing salvages valid entries and merges duplicates safely", () => {
  const parsed = parseMissionRecords(JSON.stringify({
    version: MISSION_RECORDS_VERSION,
    missions: [
      null,
      { missionId: "", bestRun: { commands: 1, activeMs: 100 } },
      {
        missionId: "sea-bat",
        bestRun: { commands: 5, activeMs: 1_000 },
        fewestCommands: 5,
        fastestActiveMs: 1_000,
        clearCount: 2,
        firstClearedAt: "2026-08-02T00:00:00.000Z",
      },
      {
        missionId: "sea-bat",
        bestRun: { commands: 4, activeMs: 5_000 },
        fewestCommands: 4,
        fastestActiveMs: 900,
        clearCount: 3,
        firstClearedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  }));

  assert.deepEqual(parsed.missions, [{
    missionId: "sea-bat",
    bestRun: { commands: 4, activeMs: 5_000 },
    fewestCommands: 4,
    fastestActiveMs: 900,
    clearCount: 3,
    firstClearedAt: "2026-08-01T00:00:00.000Z",
  }]);
});

test("SSR and unavailable browser storage never throw", () => {
  assert.deepEqual(loadMissionRecords(null), createEmptyMissionRecords());
  assert.equal(saveMissionRecords(createEmptyMissionRecords(), null), false);

  const unavailable: MissionRecordStorage = {
    getItem() {
      throw new DOMException("blocked", "SecurityError");
    },
    setItem() {
      throw new DOMException("quota", "QuotaExceededError");
    },
  };
  assert.deepEqual(loadMissionRecords(unavailable), createEmptyMissionRecords());
  const update = updateStoredMissionResult({
    missionId: "__proto__",
    result: "victory",
    commands: 1,
    activeMs: 1,
  }, unavailable);
  assert.equal(update.changed, true);
  assert.equal(update.persisted, false);
  assert.equal(findMissionRecord(update.records, "__proto__")?.fewestCommands, 1);
});

test("invalid victory metrics are ignored instead of poisoning saved records", () => {
  const empty = createEmptyMissionRecords();
  for (const result of [
    { missionId: 1, result: "victory", commands: -1, activeMs: 100 },
    { missionId: 1, result: "victory", commands: 1.5, activeMs: 100 },
    { missionId: 1, result: "victory", commands: 1, activeMs: Number.NaN },
    { missionId: 1, result: "victory", commands: 1, activeMs: -1 },
  ] as const) {
    assert.equal(applyMissionResult(empty, result).changed, false);
  }
});
