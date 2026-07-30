import { STANDARD_FLEET, type ShipId, type StageDefinition } from "./constants.ts";

export type GameMode = "casual" | "tactics" | "survival";

export const FULL_FLEET: ShipId[] = [...STANDARD_FLEET];
export const SURVIVAL_STAGE_FIVE_FLEET: ShipId[] = ["submarine", "silentSubmarine"];

export function usesTacticsRules(mode: GameMode) {
  return mode === "tactics" || mode === "survival";
}

export function aiSkillFor(mode: GameMode, stageId: number, base: number) {
  if (usesTacticsRules(mode) && stageId === 5) return 1.819;
  if (mode === "survival" && stageId === 6) return 1.05 * 1.7;
  return base * (usesTacticsRules(mode) ? 1.7 : 1.38);
}

export function enemyFleetFor(mode: GameMode, stage: StageDefinition) {
  return mode === "survival" && stage.id === 5
    ? [...SURVIVAL_STAGE_FIVE_FLEET]
    : [...stage.fleet];
}

export function missionFor(mode: GameMode, stage: StageDefinition) {
  if (mode === "survival" && stage.id === 5) {
    return {
      title: "SEA BAT",
      subtitle: "\u901a\u5e38\u6f5c\u6c34\u8266\u3068\u7121\u97f3\u6f5c\u822a\u3059\u308b\u7279\u6b8a\u6f5c\u822a\u8266\u3092\u6355\u6349\u3057\u3001\u8266\u968a\u3092\u6e29\u5b58\u305b\u3088\u3002",
    };
  }
  return { title: stage.title, subtitle: stage.subtitle };
}

export function playerFleetFor(mode: GameMode, stageFleet: ShipId[], survivalFleet: ShipId[]) {
  return mode === "survival" ? [...survivalFleet] : [...stageFleet];
}

export function survivingFleet(currentFleet: ShipId[], sunk: ShipId[]) {
  const lost = new Set(sunk);
  return currentFleet.filter((id) => !lost.has(id));
}
