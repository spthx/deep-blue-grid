import { STANDARD_FLEET, STAGES, type ShipId, type StageDefinition } from "./constants.ts";

export type GameMode = "casual" | "tactics" | "survival";

export const FULL_FLEET: ShipId[] = [...STANDARD_FLEET];
export const SURVIVAL_STAGES: ReadonlyArray<StageDefinition> = [
  {
    id: 1,
    title: "DOUBLE SCREEN",
    subtitle: "二重護衛網を突破し、主力艦への攻撃路を確保せよ",
    fleet: ["carrier", "battleship", "escort", "escortBravo"],
    aiSkill: .9,
  },
  {
    ...STAGES[2],
    fleet: [...STAGES[2].fleet],
  },
  {
    id: 5,
    title: "SEA BAT",
    subtitle: "無音潜航を繰り返す特殊潜航艦を再捕捉せよ",
    fleet: ["silentSubmarine"],
    aiSkill: 1.07,
  },
  {
    id: 6,
    title: "DEEP BLUE GRID",
    subtitle: "最終海域。護衛を欠く敵主力艦隊を撃破せよ",
    fleet: ["carrier", "battleship", "cruiser", "submarine"],
    aiSkill: 1.05,
  },
];

export function usesTacticsRules(mode: GameMode) {
  return mode === "tactics" || mode === "survival";
}

export function aiSkillFor(mode: GameMode, stageId: number, base: number) {
  if (usesTacticsRules(mode) && stageId === 5) return 1.819;
  if (mode === "survival" && stageId === 6) return 1.05 * 1.7;
  return base * (usesTacticsRules(mode) ? 1.7 : 1.38);
}

export function enemyFleetFor(mode: GameMode, stage: StageDefinition) {
  return [...stage.fleet];
}

export function missionFor(mode: GameMode, stage: StageDefinition) {
  return { title: stage.title, subtitle: stage.subtitle };
}

export function stagesFor(mode: GameMode) {
  return mode === "survival" ? SURVIVAL_STAGES : STAGES;
}

export function isSeaBatStage(mode: GameMode, stage: StageDefinition) {
  return mode === "survival" && stage.id === 5;
}

export function huntBreadthFor(mode: GameMode, operationIndex: number) {
  if (mode !== "survival") return 1;
  return [8, 5, 1, 3][operationIndex] ?? 1;
}

export function playerFleetFor(mode: GameMode, stageFleet: ShipId[], survivalFleet: ShipId[]) {
  return mode === "survival" ? [...survivalFleet] : [...stageFleet];
}

export function survivingFleet(currentFleet: ShipId[], sunk: ShipId[]) {
  const lost = new Set(sunk);
  return currentFleet.filter((id) => !lost.has(id));
}
