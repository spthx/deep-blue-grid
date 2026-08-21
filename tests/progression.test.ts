import assert from "node:assert/strict";
import test from "node:test";
import { MISSION_LIBRARY } from "../app/game/Campaign.ts";
import { applyMissionResult, createEmptyMissionRecords } from "../app/game/MissionRecords.ts";
import {
  MODE_ROUTE,
  PROGRESSION_STORAGE_KEY,
  completeMode,
  createEmptyProgression,
  debugUnlockAllFromSearch,
  isTrainingLessonUnlocked,
  loadProgression,
  migrateLegacyProgression,
  missionQualificationComplete,
  missionQualificationMarks,
  modeAccess,
  progressionSerializedStatus,
  parseProgression,
  saveProgression,
  serializeProgression,
  updateStoredModeCompletion,
} from "../app/game/Progression.ts";
import { createEmptyTrainingProgress, completeTrainingLesson } from "../app/game/TrainingProgress.ts";

test("fresh progression exposes only training and unlocks one mode at a time", () => {
  let state = createEmptyProgression();
  assert.deepEqual(MODE_ROUTE.map((mode) => modeAccess(state, mode).allowed), [true, false, false, false, false]);
  assert.equal(completeMode(state, "tactics"), state);

  for (const mode of MODE_ROUTE) {
    state = completeMode(state, mode);
  }
  assert.deepEqual(state.completedModes, MODE_ROUTE);
  assert.equal(completeMode(state, "survival"), state);
});

test("stored progression is canonical, monotonic and safe around corrupt data", () => {
  assert.deepEqual(parseProgression("broken"), createEmptyProgression());
  assert.deepEqual(parseProgression(JSON.stringify({ version: 99, completedModes: ["training"] })), createEmptyProgression());
  assert.deepEqual(parseProgression(JSON.stringify({
    version: 1,
    completedModes: ["tactics", "training", "training", "survival", "casual", "bogus"],
  })).completedModes, ["training", "casual", "tactics"]);

  const complete = MODE_ROUTE.reduce((state, mode) => completeMode(state, mode), createEmptyProgression());
  assert.equal(serializeProgression(complete), '{"version":1,"completedModes":["training","casual","tactics","mission","survival"]}');
});

test("invalid progression falls back to legacy evidence while future saves are identified for preservation", () => {
  const evidence = { trainingComplete: true, hasMissionRecord: true, missionQualified: true };
  const invalidStorage = { getItem() { return "{broken"; }, setItem() {} };
  const futureStorage = { getItem() { return '{"version":2,"completedModes":["training"]}'; }, setItem() {} };
  assert.equal(progressionSerializedStatus("{broken"), "invalid");
  assert.equal(progressionSerializedStatus(futureStorage.getItem()), "future");
  assert.deepEqual(loadProgression(invalidStorage, evidence).completedModes, ["training", "casual", "tactics", "mission"]);
  assert.deepEqual(loadProgression(futureStorage, evidence).completedModes, ["training", "casual", "tactics", "mission"]);
});

test("a valid empty intermediate save is monotonically recovered from older completion evidence", () => {
  const storage = { getItem() { return '{"version":1,"completedModes":[]}'; }, setItem() {} };
  const evidence = { trainingComplete: true, hasMissionRecord: false, missionQualified: false };
  assert.deepEqual(loadProgression(storage, evidence).completedModes, ["training"]);
});

test("legacy evidence preserves veteran access without inventing survival completion", () => {
  assert.deepEqual(migrateLegacyProgression({ trainingComplete: true, hasMissionRecord: false, missionQualified: false }).completedModes, ["training"]);
  assert.deepEqual(migrateLegacyProgression({ trainingComplete: false, hasMissionRecord: true, missionQualified: false }).completedModes, ["training", "casual", "tactics"]);
  assert.deepEqual(migrateLegacyProgression({ trainingComplete: false, hasMissionRecord: true, missionQualified: true }).completedModes, ["training", "casual", "tactics", "mission"]);
});

test("mission qualification requires tactical difficulties one through five and an archive", () => {
  let records = createEmptyMissionRecords();
  const qualifying = [1, 2, 3, 4, 5].map((difficulty) =>
    MISSION_LIBRARY.find((mission) => mission.category === "standard" && mission.difficulty === difficulty)!).concat(
      MISSION_LIBRARY.find((mission) => mission.category === "archive")!,
    );
  for (const [index, mission] of qualifying.entries()) {
    records = applyMissionResult(records, { missionId: mission.id, result: "victory", commands: 1, activeMs: 1000 }).records;
    assert.equal(missionQualificationComplete(records, MISSION_LIBRARY), index === qualifying.length - 1);
  }
  assert.deepEqual(missionQualificationMarks(records, MISSION_LIBRARY).map((mark) => mark.complete), [true, true, true, true, true, true]);
});

test("training sequence opens only the next lesson while retaining completed replay", () => {
  const sequence = [7, 1, 2, 3];
  let progress = createEmptyTrainingProgress();
  assert.deepEqual(sequence.map((lesson) => isTrainingLessonUnlocked(progress, lesson, sequence)), [true, false, false, false]);
  progress = completeTrainingLesson(progress, 7);
  assert.deepEqual(sequence.map((lesson) => isTrainingLessonUnlocked(progress, lesson, sequence)), [true, true, false, false]);
  assert.equal(isTrainingLessonUnlocked(progress, 3, sequence, true), true);
});

test("legacy six-lesson completion still requires newly inserted lessons in route order", () => {
  const sequence = [7, 1, 2, 3, 4, 5, 6, 8, 9];
  let progress = { version: 1 as const, completedLessons: [1, 2, 3, 4, 5, 6] };
  assert.deepEqual(
    sequence.map((lesson) => isTrainingLessonUnlocked(progress, lesson, sequence)),
    [true, true, true, true, true, true, true, false, false],
  );
  progress = completeTrainingLesson(progress, 7);
  assert.equal(isTrainingLessonUnlocked(progress, 8, sequence), true);
  assert.equal(isTrainingLessonUnlocked(progress, 9, sequence), false);
});

test("debug query grants runtime access without entering serialized progression", () => {
  const empty = createEmptyProgression();
  assert.equal(debugUnlockAllFromSearch("?debug=all"), true);
  assert.equal(debugUnlockAllFromSearch("?debug=all-modes"), false);
  assert.ok(MODE_ROUTE.every((mode) => modeAccess(empty, mode, true).allowed));
  assert.equal(serializeProgression(empty), '{"version":1,"completedModes":[]}');
});

test("progression storage helpers tolerate unavailable storage", () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem(key: string) { return memory.get(key) ?? null; },
    setItem(key: string, value: string) { memory.set(key, value); },
  };
  assert.equal(saveProgression(createEmptyProgression(), storage), true);
  assert.equal(memory.has(PROGRESSION_STORAGE_KEY), true);
  const update = updateStoredModeCompletion("training", storage);
  assert.equal(update.persisted, true);
  assert.deepEqual(loadProgression(storage).completedModes, ["training"]);

  const failing = { getItem() { throw new Error("no read"); }, setItem() { throw new Error("no write"); } };
  assert.deepEqual(loadProgression(failing), createEmptyProgression());
  assert.equal(saveProgression(createEmptyProgression(), failing), false);
});
