import { GRID_SIZE, ORIENTATIONS, type Coord } from "./constants.ts";
import type { MissionOrder, MissionStageDefinition, TrainingPlan, TrainingStep } from "./Campaign.ts";

const TARGET_COUNTS = { phantom: 4, mk45: 2 } as const;

const coordKey = ({ x, y }: Coord) => `${x},${y}`;
const sameCoord = (left: Coord, right: Coord) => left.x === right.x && left.y === right.y;
const inBounds = ({ x, y }: Coord) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE;

/** Compares coordinate collections as sets. Input order is deliberately ignored. */
export function sameTargetSet(left: ReadonlyArray<Coord>, right: ReadonlyArray<Coord>) {
  if (left.length !== right.length) return false;
  const leftKeys = new Set(left.map(coordKey));
  const rightKeys = new Set(right.map(coordKey));
  if (leftKeys.size !== left.length || rightKeys.size !== right.length) return false;
  return leftKeys.size === rightKeys.size && [...leftKeys].every((key) => rightKeys.has(key));
}

/** Strict order matching, except that multi-target weapon selections are sets. */
export function missionOrdersEqual(expected: MissionOrder, actual: MissionOrder) {
  if (expected.weapon !== actual.weapon) return false;
  switch (expected.weapon) {
    case "fire":
      return actual.weapon === "fire" && sameCoord(expected.target, actual.target);
    case "radar":
      return actual.weapon === "radar" && sameCoord(expected.origin, actual.origin);
    case "harpoon":
      return actual.weapon === "harpoon" && sameCoord(expected.center, actual.center);
    case "sparrow":
      return actual.weapon === "sparrow"
        && expected.orientation === actual.orientation
        && sameCoord(expected.anchor, actual.anchor);
    case "phantom":
    case "mk45":
      return actual.weapon === expected.weapon && sameTargetSet(expected.targets, actual.targets);
  }
}

export const matchesTrainingOrder = missionOrdersEqual;
export const trainingOrderMatches = missionOrdersEqual;

export function expectedTrainingOrder(stage: MissionStageDefinition, stepIndex: number) {
  return stage.training?.steps[stepIndex]?.expected ?? null;
}

export function matchesTrainingStep(step: TrainingStep, actual: MissionOrder) {
  return missionOrdersEqual(step.expected, actual);
}

export function validateMissionOrder(order: MissionOrder) {
  const issues: string[] = [];
  if (order.weapon === "fire" && !inBounds(order.target)) issues.push("fire target is out of bounds");
  if (order.weapon === "radar") {
    if (!inBounds(order.origin) || order.origin.x >= GRID_SIZE - 1 || order.origin.y >= GRID_SIZE - 1) {
      issues.push("radar origin cannot form a 2x2 area");
    }
  }
  if (order.weapon === "harpoon" && !inBounds(order.center)) issues.push("harpoon center is out of bounds");
  if (order.weapon === "sparrow") {
    if (!inBounds(order.anchor)) issues.push("sparrow anchor is out of bounds");
    if (!ORIENTATIONS.includes(order.orientation)) issues.push("sparrow orientation is invalid");
  }
  if (order.weapon === "phantom" || order.weapon === "mk45") {
    const required = TARGET_COUNTS[order.weapon];
    if (order.targets.length !== required) issues.push(`${order.weapon} requires ${required} targets`);
    if (new Set(order.targets.map(coordKey)).size !== order.targets.length) issues.push(`${order.weapon} targets contain duplicates`);
    if (order.targets.some((target) => !inBounds(target))) issues.push(`${order.weapon} target is out of bounds`);
  }
  return issues;
}

export function validateTrainingStep(step: TrainingStep) {
  const issues = validateMissionOrder(step.expected);
  if (!step.title.trim()) issues.push("step title is empty");
  if (!step.instruction.trim()) issues.push("step instruction is empty");
  if (!step.doctrine.trim()) issues.push("step doctrine is empty");
  for (const coord of step.highlight ?? []) if (!inBounds(coord)) issues.push("step highlight is out of bounds");
  return issues;
}

export function validateTrainingPlan(plan: TrainingPlan) {
  const issues: string[] = [];
  if (!Number.isSafeInteger(plan.lesson) || plan.lesson < 1) issues.push("lesson number must be a positive integer");
  if (!plan.plainBrief.trim()) issues.push("plain brief is empty");
  if (!plan.doctrine.trim()) issues.push("doctrine header is empty");
  if (plan.suppressEnemyActions !== true) issues.push("enemy actions must be suppressed");
  if (plan.steps.length === 0) issues.push("training plan has no steps");
  if (plan.debrief.length === 0 || plan.debrief.some((line) => !line.trim())) issues.push("training debrief is empty");
  plan.steps.forEach((step, index) => {
    issues.push(...validateTrainingStep(step).map((issue) => `step ${index + 1}: ${issue}`));
  });
  return issues;
}

export function validateTrainingStage(stage: MissionStageDefinition) {
  const issues: string[] = [];
  if (stage.category !== "training") issues.push("category must be training");
  if (!stage.training) return [...issues, "training plan is missing"];
  if (stage.training.lesson !== stage.id - 100) issues.push("lesson number does not match stage id");
  for (const step of stage.training.steps) {
    if (!stage.allowedWeapons.includes(step.expected.weapon)) {
      issues.push(`${step.expected.weapon} is not an allowed weapon`);
    }
  }
  issues.push(...validateTrainingPlan(stage.training));
  return issues;
}

export function validateTrainingLibrary(library: ReadonlyArray<MissionStageDefinition>) {
  const issues: string[] = [];
  const ids = new Set<number>();
  const lessons = new Set<number>();
  for (const stage of library) {
    if (ids.has(stage.id)) issues.push(`duplicate training id ${stage.id}`);
    ids.add(stage.id);
    const lesson = stage.training?.lesson;
    if (lesson !== undefined) {
      if (lessons.has(lesson)) issues.push(`duplicate lesson ${lesson}`);
      lessons.add(lesson);
    }
    issues.push(...validateTrainingStage(stage).map((issue) => `${stage.id}/${stage.title}: ${issue}`));
  }
  return issues;
}
