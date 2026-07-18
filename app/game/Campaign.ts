import { SHIPS, type ShipId } from "./constants.ts";

export type GameMode = "casual" | "tactics" | "survival";

export const FULL_FLEET: ShipId[] = SHIPS.map((ship) => ship.id);

export function usesTacticsRules(mode: GameMode) {
  return mode === "tactics" || mode === "survival";
}

export function aiSkillFor(mode: GameMode, stageId: number, base: number) {
  if (usesTacticsRules(mode) && stageId === 5) return 1.819;
  return base * (usesTacticsRules(mode) ? 1.7 : 1.38);
}

export function playerFleetFor(mode: GameMode, stageFleet: ShipId[], survivalFleet: ShipId[]) {
  return mode === "survival" ? [...survivalFleet] : [...stageFleet];
}

export function survivingFleet(currentFleet: ShipId[], sunk: ShipId[]) {
  const lost = new Set(sunk);
  return currentFleet.filter((id) => !lost.has(id));
}
