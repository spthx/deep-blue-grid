import assert from "node:assert/strict";
import test from "node:test";
import {
  TRAINING_PROGRESS_STORAGE_KEY,
  completeTrainingLesson,
  createEmptyTrainingProgress,
  isTrainingLessonComplete,
  nextIncompleteTrainingLesson,
  parseTrainingProgress,
  serializeTrainingProgress,
  trainingCompletionCount,
  updateStoredTrainingProgress,
} from "../app/game/TrainingProgress.ts";

test("training progress serialization is canonical and rejects malformed storage", () => {
  assert.deepEqual(parseTrainingProgress(null), createEmptyTrainingProgress());
  assert.deepEqual(parseTrainingProgress("not json"), createEmptyTrainingProgress());
  const parsed = parseTrainingProgress(JSON.stringify({
    version: 1,
    completedLessons: [4, 2, 2, 99, "1"],
  }));
  assert.deepEqual(parsed.completedLessons, [2, 4]);
  assert.equal(serializeTrainingProgress(parsed), '{"version":1,"completedLessons":[2,4]}');
});

test("training completion updates are immutable, ordered, and idempotent", () => {
  const empty = createEmptyTrainingProgress();
  const afterTwo = completeTrainingLesson(empty, 2);
  const afterOne = completeTrainingLesson(afterTwo, 1);
  assert.deepEqual(afterOne.completedLessons, [1, 2]);
  assert.equal(completeTrainingLesson(afterOne, 2), afterOne);
  assert.equal(completeTrainingLesson(afterOne, 99), afterOne);
  assert.equal(isTrainingLessonComplete(afterOne, 2), true);
  assert.equal(nextIncompleteTrainingLesson(afterOne), 3);
  assert.equal(trainingCompletionCount(afterOne), 2);
  assert.deepEqual(completeTrainingLesson(afterOne, 103).completedLessons, [1, 2, 3]);
});

test("non-sequential completion routes to the actual missing lesson", () => {
  const almostComplete = parseTrainingProgress(JSON.stringify({
    version: 1,
    completedLessons: [1, 2, 4, 5, 6],
  }));
  assert.equal(nextIncompleteTrainingLesson(almostComplete), 3);
  assert.equal(nextIncompleteTrainingLesson(completeTrainingLesson(almostComplete, 3)), null);
});

test("stored training updates use the dedicated key and survive storage errors", () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem(key: string) { return memory.get(key) ?? null; },
    setItem(key: string, value: string) { memory.set(key, value); },
  };
  const update = updateStoredTrainingProgress(3, storage);
  assert.equal(update.changed, true);
  assert.equal(update.persisted, true);
  assert.deepEqual(JSON.parse(memory.get(TRAINING_PROGRESS_STORAGE_KEY)!), {
    version: 1,
    completedLessons: [3],
  });

  const failingStorage = {
    getItem() { throw new Error("unavailable"); },
    setItem() { throw new Error("quota"); },
  };
  assert.equal(updateStoredTrainingProgress(1, failingStorage).persisted, false);
});
