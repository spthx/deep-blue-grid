export const TRAINING_PROGRESS_VERSION = 1 as const;
export const TRAINING_PROGRESS_STORAGE_KEY = "deep-blue-grid.training-progress";
export const TRAINING_LESSONS = [1, 2, 3, 4, 5, 6] as const;

export type TrainingLesson = typeof TRAINING_LESSONS[number];
export type TrainingProgress = Readonly<{
  version: typeof TRAINING_PROGRESS_VERSION;
  completedLessons: readonly TrainingLesson[];
}>;
export type TrainingProgressStorage = Pick<Storage, "getItem" | "setItem">;

export function createEmptyTrainingProgress(): TrainingProgress {
  return { version: TRAINING_PROGRESS_VERSION, completedLessons: [] };
}

export function parseTrainingProgress(serialized: string | null): TrainingProgress {
  if (!serialized) return createEmptyTrainingProgress();
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isObject(value) || value.version !== TRAINING_PROGRESS_VERSION || !Array.isArray(value.completedLessons)) {
      return createEmptyTrainingProgress();
    }
    const completedLessons = [...new Set(value.completedLessons.filter(isTrainingLesson))].sort((a, b) => a - b);
    return { version: TRAINING_PROGRESS_VERSION, completedLessons };
  } catch {
    return createEmptyTrainingProgress();
  }
}

export function serializeTrainingProgress(progress: TrainingProgress) {
  const completedLessons = [...new Set(progress.completedLessons.filter(isTrainingLesson))].sort((a, b) => a - b);
  return JSON.stringify({ version: TRAINING_PROGRESS_VERSION, completedLessons });
}

export function isTrainingLessonComplete(progress: TrainingProgress, lesson: number) {
  const normalized = normalizeLesson(lesson);
  return normalized !== null && progress.completedLessons.includes(normalized);
}

/** Immutable and idempotent progress update. Accepts lesson 1..6 or stage id 101..106. */
export function completeTrainingLesson(progress: TrainingProgress, lesson: number): TrainingProgress {
  const normalized = normalizeLesson(lesson);
  if (normalized === null || progress.completedLessons.includes(normalized)) return progress;
  return {
    version: TRAINING_PROGRESS_VERSION,
    completedLessons: [...progress.completedLessons, normalized].sort((a, b) => a - b),
  };
}

export const updateTrainingProgress = completeTrainingLesson;
export const markTrainingLessonComplete = completeTrainingLesson;

export function nextIncompleteTrainingLesson(progress: TrainingProgress): TrainingLesson | null {
  return TRAINING_LESSONS.find((lesson) => !progress.completedLessons.includes(lesson)) ?? null;
}

export function trainingCompletionCount(progress: TrainingProgress) {
  return progress.completedLessons.length;
}

export function trainingStageIdForLesson(lesson: TrainingLesson) {
  return 100 + lesson;
}

export function completedTrainingStageIds(progress: TrainingProgress) {
  return progress.completedLessons.map(trainingStageIdForLesson);
}

export function loadTrainingProgress(storage: TrainingProgressStorage | null = browserStorage()): TrainingProgress {
  if (storage === null) return createEmptyTrainingProgress();
  try {
    return parseTrainingProgress(storage.getItem(TRAINING_PROGRESS_STORAGE_KEY));
  } catch {
    return createEmptyTrainingProgress();
  }
}

export function saveTrainingProgress(
  progress: TrainingProgress,
  storage: TrainingProgressStorage | null = browserStorage(),
) {
  if (storage === null) return false;
  try {
    storage.setItem(TRAINING_PROGRESS_STORAGE_KEY, serializeTrainingProgress(progress));
    return true;
  } catch {
    return false;
  }
}

export function updateStoredTrainingProgress(
  lesson: number,
  storage: TrainingProgressStorage | null = browserStorage(),
) {
  const previous = loadTrainingProgress(storage);
  const progress = completeTrainingLesson(previous, lesson);
  return {
    progress,
    changed: progress !== previous,
    persisted: progress === previous || saveTrainingProgress(progress, storage),
  };
}

function browserStorage(): TrainingProgressStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isTrainingLesson(value: unknown): value is TrainingLesson {
  return typeof value === "number" && TRAINING_LESSONS.includes(value as TrainingLesson);
}

function normalizeLesson(value: unknown): TrainingLesson | null {
  if (isTrainingLesson(value)) return value;
  const fromStageId = typeof value === "number" ? value - 100 : NaN;
  return isTrainingLesson(fromStageId) ? fromStageId : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
