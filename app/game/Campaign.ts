import {
  STANDARD_FLEET,
  STAGES,
  type ShipId,
  type StageDefinition,
  type WeaponId,
  type Coord,
  type Orientation,
} from "./constants.ts";

export type GameMode = "casual" | "tactics" | "survival" | "mission";

export type MissionObjective =
  | {
      kind: "destroy-targets";
      targets: ShipId[];
      maxFriendlyActions: number;
      protectedShips?: ShipId[];
    }
  | {
      kind: "sonar-reports";
      maxFriendlyActions: number;
      protectedShip: ShipId;
      reports: Array<{ origin: Coord; contact: boolean; code: string }>;
    };

export type MissionPlacement = { id: ShipId; start: Coord; orientation: Orientation };
export type MissionIntelMark = { coord: Coord; mark: "miss" | "echo" };

export type MissionStageDefinition = StageDefinition & {
  playerFleet: ShipId[];
  enemyFleet: ShipId[];
  enemyFirst: boolean;
  allowedWeapons: WeaponId[];
  objective: MissionObjective;
  directive: string;
  condition: string;
  playerInitialHits?: Coord[];
  enemyInitialHits?: Coord[];
  playerPlacements: MissionPlacement[];
  enemyPlacements: MissionPlacement[];
  initialIntel?: MissionIntelMark[];
  initialEnemyWakes?: Coord[];
  initiallyIdentified?: ShipId[];
  fixedSeed: number;
  requiredLink?: "carrier" | "battleship";
  huntBreadth?: number;
  completion: {
    success: string;
    deadline: string;
    protected?: Partial<Record<ShipId, string>>;
  };
};

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

/**
 * 独立した限定任務群。通常海域とSURVIVALの進行・損耗状態を共有しない。
 * 編成、先攻、装備、初期損傷、勝敗条件をここだけで完結させる。
 */
export const MISSION_STAGES: ReadonlyArray<MissionStageDefinition> = [
  {
    id: 1,
    title: "NARROW GATE",
    subtitle: "狭水道へ進入した小型艦だけを三手で切り離せ",
    directive: "既知損傷と音紋を利用し、敵駆逐艦・潜水艦を3行動以内に撃沈せよ。",
    condition: "DD・SS撃沈 / 3行動以内 / 敵主力艦の残存可",
    fleet: ["battleship", "destroyer", "escort", "submarine"],
    enemyFleet: ["battleship", "destroyer", "escort", "submarine"],
    playerFleet: ["cruiser", "destroyer"],
    enemyFirst: false,
    allowedWeapons: ["fire", "sparrow", "mk45"],
    objective: { kind: "destroy-targets", targets: ["destroyer", "submarine"], maxFriendlyActions: 3 },
    playerPlacements: [
      { id: "cruiser", start: { x: 1, y: 6 }, orientation: "east" },
      { id: "destroyer", start: { x: 5, y: 7 }, orientation: "west" },
    ],
    enemyPlacements: [
      { id: "battleship", start: { x: 0, y: 0 }, orientation: "east" },
      { id: "destroyer", start: { x: 2, y: 2 }, orientation: "east" },
      { id: "escort", start: { x: 0, y: 7 }, orientation: "east" },
      { id: "submarine", start: { x: 5, y: 5 }, orientation: "east" },
    ],
    enemyInitialHits: [{ x: 3, y: 2 }],
    initialIntel: [{ coord: { x: 5, y: 3 }, mark: "miss" }],
    initialEnemyWakes: [{ x: 4, y: 4 }, { x: 6, y: 4 }],
    initiallyIdentified: ["destroyer"],
    fixedSeed: 0x4d0101,
    aiSkill: 1.56,
    huntBreadth: 3,
    completion: {
      success: "INTERCEPTION COMPLETE：通過対象2隻の戦闘能力喪失を確認。残存敵主力との交戦を打ち切る。",
      deadline: "INTERCEPTION WINDOW CLOSED：阻止限界時刻を超過。対象艦の海域離脱を確認。",
    },
  },
  {
    id: 2,
    title: "SILENT WATCH",
    subtitle: "発砲せず、二つの指定海面から相反する聴音報告を得よ",
    directive: "ALPHAでCONTACT、BRAVOでNO CONTACTを記録し、2行動で離脱せよ。",
    condition: "指定聴音2件 / 射撃禁止 / 潜水艦生存 / 2行動",
    fleet: ["battleship", "cruiser", "destroyer", "escort", "submarine"],
    enemyFleet: ["battleship", "cruiser", "destroyer", "escort", "submarine"],
    playerFleet: ["escort", "submarine"],
    enemyFirst: true,
    allowedWeapons: ["radar"],
    objective: {
      kind: "sonar-reports",
      maxFriendlyActions: 2,
      protectedShip: "submarine",
      reports: [
        { origin: { x: 2, y: 2 }, contact: true, code: "ALPHA / C-3" },
        { origin: { x: 0, y: 5 }, contact: false, code: "BRAVO / F-1" },
      ],
    },
    playerPlacements: [
      { id: "escort", start: { x: 0, y: 0 }, orientation: "east" },
      { id: "submarine", start: { x: 7, y: 7 }, orientation: "east" },
    ],
    enemyPlacements: [
      { id: "battleship", start: { x: 0, y: 7 }, orientation: "east" },
      { id: "cruiser", start: { x: 2, y: 3 }, orientation: "east" },
      { id: "destroyer", start: { x: 5, y: 0 }, orientation: "east" },
      { id: "escort", start: { x: 4, y: 5 }, orientation: "east" },
      { id: "submarine", start: { x: 2, y: 1 }, orientation: "east" },
    ],
    fixedSeed: 0x4d0202,
    aiSkill: 1.7,
    huntBreadth: 4,
    completion: {
      success: "ACOUSTIC PICTURE ESTABLISHED：敵影1件、反応なし1件を記録。観測資料を送信し離脱する。",
      deadline: "SONAR REPORT INCOMPLETE：聴音回数を消費。所要の二種報告を確立できず。",
      protected: { submarine: "LISTENING POST LOST：聴音艦との連絡途絶。任務継続不能。" },
    },
  },
  {
    id: 3,
    title: "LAST FLIGHT",
    subtitle: "損傷空母の最終攻撃隊を二度だけ発進させよ",
    directive: "識別済み重要区画から戦艦の二つの配置仮説を切り分け、2行動で撃沈せよ。",
    condition: "BB撃沈 / 空母生存 / F-4 2回以内 / 護衛リンク固定",
    fleet: ["battleship", "cruiser", "destroyer", "submarine"],
    enemyFleet: ["battleship", "cruiser", "destroyer", "submarine"],
    playerFleet: ["carrier", "escort"],
    enemyFirst: true,
    allowedWeapons: ["fire", "phantom"],
    objective: { kind: "destroy-targets", targets: ["battleship"], maxFriendlyActions: 2, protectedShips: ["carrier"] },
    playerPlacements: [
      { id: "carrier", start: { x: 1, y: 5 }, orientation: "east" },
      { id: "escort", start: { x: 1, y: 4 }, orientation: "east" },
    ],
    enemyPlacements: [
      { id: "battleship", start: { x: 1, y: 3 }, orientation: "east" },
      { id: "cruiser", start: { x: 0, y: 0 }, orientation: "east" },
      { id: "destroyer", start: { x: 4, y: 7 }, orientation: "east" },
      { id: "submarine", start: { x: 7, y: 1 }, orientation: "east" },
    ],
    playerInitialHits: [{ x: 1, y: 6 }, { x: 4, y: 6 }],
    enemyInitialHits: [{ x: 3, y: 3 }],
    initiallyIdentified: ["battleship"],
    requiredLink: "carrier",
    fixedSeed: 0x4d0303,
    aiSkill: 1.785,
    huntBreadth: 2,
    completion: {
      success: "TARGET NEUTRALIZED：敵戦艦の戦闘能力喪失を確認。航空隊収容へ移行。",
      deadline: "SORTIE WINDOW CLOSED：攻撃可能時間を超過。敵主力は射程外へ離脱。",
      protected: { carrier: "FLIGHT CONTROL LOST：航空運用母艦の戦闘能力喪失。任務中止。" },
    },
  },
  {
    id: 4,
    title: "BROKEN SPEAR",
    subtitle: "主砲を失った残存二艦で、敵航空中枢だけを三斉射で破砕せよ",
    directive: "射撃管制リンクを維持し、HARPOON 3斉射以内に敵空母を撃沈せよ。",
    condition: "CV撃沈 / HARPOONのみ / 3行動 / BB・DE生存 / 自軍先制",
    fleet: ["carrier", "battleship", "cruiser", "destroyer", "escort", "submarine"],
    enemyFleet: ["carrier", "battleship", "cruiser", "destroyer", "escort", "submarine"],
    playerFleet: ["battleship", "escort"],
    enemyFirst: false,
    allowedWeapons: ["harpoon"],
    objective: { kind: "destroy-targets", targets: ["carrier"], maxFriendlyActions: 3, protectedShips: ["battleship", "escort"] },
    playerPlacements: [
      { id: "battleship", start: { x: 0, y: 6 }, orientation: "east" },
      { id: "escort", start: { x: 0, y: 5 }, orientation: "east" },
    ],
    enemyPlacements: [
      { id: "carrier", start: { x: 2, y: 2 }, orientation: "east" },
      { id: "battleship", start: { x: 0, y: 7 }, orientation: "east" },
      { id: "cruiser", start: { x: 0, y: 5 }, orientation: "east" },
      { id: "destroyer", start: { x: 5, y: 0 }, orientation: "east" },
      { id: "escort", start: { x: 6, y: 6 }, orientation: "east" },
      { id: "submarine", start: { x: 0, y: 0 }, orientation: "east" },
    ],
    playerInitialHits: [{ x: 0, y: 6 }],
    enemyInitialHits: [{ x: 2, y: 2 }, { x: 4, y: 2 }],
    initialIntel: [
      { coord: { x: 3, y: 0 }, mark: "miss" },
      { coord: { x: 3, y: 1 }, mark: "echo" },
      { coord: { x: 4, y: 4 }, mark: "echo" },
    ],
    initiallyIdentified: ["carrier"],
    requiredLink: "battleship",
    fixedSeed: 0x4d0404,
    aiSkill: 1.819,
    huntBreadth: 1,
    completion: {
      success: "CARRIER STRIKE COMPLETE：敵空母の戦闘能力喪失を確認。残存部隊は離脱針路へ移行。",
      deadline: "STRIKE WINDOW CLOSED：攻撃限界時刻を超過。敵空母の離脱を許す。",
      protected: {
        battleship: "LAUNCH PLATFORM LOST：戦艦の戦闘能力喪失。誘導弾射撃不能。",
        escort: "FIRE CONTROL LINK LOST：射撃管制連接喪失。第3射実施不能、任務中止。",
      },
    },
  },
];

export function usesTacticsRules(mode: GameMode) {
  return mode === "tactics" || mode === "survival" || mode === "mission";
}

export function aiSkillFor(mode: GameMode, stageId: number, base: number) {
  if (mode === "mission") return base;
  if (usesTacticsRules(mode) && stageId === 5) return 1.819;
  if (mode === "survival" && stageId === 6) return 1.05 * 1.7;
  return base * (usesTacticsRules(mode) ? 1.7 : 1.38);
}

export function enemyFleetFor(mode: GameMode, stage: StageDefinition) {
  const rule = missionRuleFor(mode, stage);
  return [...(rule?.enemyFleet ?? stage.fleet)];
}

export function missionFor(_mode: GameMode, stage: StageDefinition) {
  return { title: stage.title, subtitle: stage.subtitle };
}

export function stagesFor(mode: GameMode): ReadonlyArray<StageDefinition> {
  if (mode === "survival") return SURVIVAL_STAGES;
  if (mode === "mission") return MISSION_STAGES;
  return STAGES;
}

export function missionRuleFor(mode: GameMode, stage: StageDefinition) {
  if (mode !== "mission") return null;
  return MISSION_STAGES.find((candidate) => candidate.id === stage.id) ?? null;
}

export function isSeaBatStage(mode: GameMode, stage: StageDefinition) {
  return mode === "survival" && stage.id === 5;
}

export function huntBreadthFor(mode: GameMode, operationIndex: number) {
  if (mode === "survival") return [8, 5, 1, 3][operationIndex] ?? 1;
  if (mode === "mission") return MISSION_STAGES[operationIndex]?.huntBreadth ?? 1;
  return 1;
}

export function playerFleetFor(mode: GameMode, stage: StageDefinition, survivalFleet: ShipId[]) {
  if (mode === "survival") return [...survivalFleet];
  return [...(missionRuleFor(mode, stage)?.playerFleet ?? stage.fleet)];
}

export function friendlyStarts(mode: GameMode, stage: StageDefinition) {
  if (mode === "mission") return !missionRuleFor(mode, stage)?.enemyFirst;
  return mode === "casual";
}

export function routeUnit(mode: GameMode) {
  if (mode === "survival") return { english: "OPERATION", japanese: "作戦" };
  if (mode === "mission") return { english: "MISSION", japanese: "限定任務" };
  return { english: "SECTOR", japanese: "海域" };
}

export function survivingFleet(currentFleet: ShipId[], sunk: ShipId[]) {
  const lost = new Set(sunk);
  return currentFleet.filter((id) => !lost.has(id));
}
