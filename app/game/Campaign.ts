import {
  STANDARD_FLEET,
  STAGES,
  type ShipId,
  type StageDefinition,
  type WeaponId,
  type Coord,
  type Orientation,
} from "./constants.ts";
import { EXTREME_MISSIONS } from "./ExtremeMissions.ts";
import { TRAINING_STAGES } from "./Training.ts";

export { EXTREME_MISSIONS } from "./ExtremeMissions.ts";
export { TRAINING_STAGES } from "./Training.ts";

export type GameMode = "casual" | "tactics" | "survival" | "mission" | "training";

type MissionObjectiveCore =
  | {
      kind: "destroy-targets";
      targets: ShipId[];
      maxFriendlyActions: number;
      protectedShips?: ShipId[];
      requiredDestructionOrder?: ShipId[];
    }
  | {
      kind: "sonar-reports";
      maxFriendlyActions: number;
      protectedShip: ShipId;
      reports: Array<{ origin: Coord; contact: boolean; code: string }>;
    }
  | {
      kind: "identify-targets";
      targets: ShipId[];
      maxFriendlyActions: number;
      protectedShips?: ShipId[];
    }
  | {
      kind: "scan-and-destroy";
      targets: ShipId[];
      maxFriendlyActions: number;
      protectedShips?: ShipId[];
      reports: Array<{ origin: Coord; contact: boolean; code: string }>;
    };

export type MissionObjective = MissionObjectiveCore & {
  /** Exact action order when doctrine requires a specific firing sequence. */
  requiredWeaponSequence?: WeaponId[];
  /** Exact weapon multiset when systems may be assigned in any order. */
  requiredWeaponUses?: Partial<Record<WeaponId, number>>;
  /** Preserve the authored report order instead of treating reports as a set. */
  orderedReports?: boolean;
};

export type MissionPlacement = { id: ShipId; start: Coord; orientation: Orientation };
export type MissionIntelMark = { coord: Coord; mark: "miss" | "echo" };
export type MissionCategory = "standard" | "archive" | "extreme" | "training";
export type MissionDifficulty = 1 | 2 | 3 | 4 | 5 | 6;
export type MissionOrder =
  | { weapon: "fire"; target: Coord }
  | { weapon: "phantom" | "mk45"; targets: Coord[] }
  | { weapon: "harpoon"; center: Coord }
  | { weapon: "sparrow"; anchor: Coord; orientation: Orientation }
  | { weapon: "radar"; origin: Coord };
export type TrainingStep = {
  title: string;
  instruction: string;
  doctrine: string;
  expected: MissionOrder;
  highlight?: Coord[];
};
export type TrainingPlan = {
  lesson: number;
  plainBrief: string;
  doctrine: string;
  suppressEnemyActions: true;
  steps: TrainingStep[];
  debrief: string[];
};
export type MissionArchiveEntry = {
  time: `${string}Z`;
  text: string;
  tone?: "info" | "warning" | "critical";
};
export type MissionEnemyDisclosure = {
  known: ShipId[];
  unknownCount: number;
  callsigns?: Partial<Record<ShipId, string>>;
  candidateCells?: Array<{ code: string; coord: Coord }>;
  summary: string;
};
export type MissionInitialArsenal = Partial<Record<Exclude<WeaponId, "fire">, number>>;

export type MissionStageDefinition = StageDefinition & {
  sortOrder: number;
  difficulty: MissionDifficulty;
  category: MissionCategory;
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
  enemyDisclosure: MissionEnemyDisclosure;
  archiveLog?: MissionArchiveEntry[];
  training?: TrainingPlan;
  initialArsenal?: MissionInitialArsenal;
  fixedSeed: number;
  requiredLink?: "carrier" | "battleship";
  requiredLinks?: Array<"carrier" | "battleship">;
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
    sortOrder: 40,
    difficulty: 3,
    category: "standard",
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
    enemyDisclosure: {
      known: ["destroyer"],
      unknownCount: 3,
      summary: "DDの既知損傷と二つの音紋を公開。BB・DE・SSの艦影は未識別。",
    },
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
    sortOrder: 20,
    difficulty: 2,
    category: "standard",
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
    enemyDisclosure: {
      known: [],
      unknownCount: 5,
      candidateCells: [
        { code: "ALPHA / C-3", coord: { x: 2, y: 2 } },
        { code: "BRAVO / F-1", coord: { x: 0, y: 5 } },
      ],
      summary: "敵艦種と配置は非公開。指定された二つの2×2聴音区画だけを公開。",
    },
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
    sortOrder: 80,
    difficulty: 4,
    category: "standard",
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
    enemyDisclosure: {
      known: ["battleship"],
      unknownCount: 3,
      summary: "BBの重要区画D-4と既存命中を公開。水平・垂直の二仮説以外は未公開。",
    },
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
    sortOrder: 110,
    difficulty: 5,
    category: "standard",
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
    enemyDisclosure: {
      known: ["carrier"],
      unknownCount: 5,
      summary: "CVの重要区画・既命中2区画・既知空所3区画を公開。その他の敵影は非目標。",
    },
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
  {
    id: 5,
    sortOrder: 10,
    difficulty: 1,
    category: "standard",
    title: "ECHO CROSS",
    subtitle: "三つの反響記録が交わる一点を射抜け",
    directive: "4方向ECHOの共通隣接区画を特定し、1行動で敵潜水艦を撃沈せよ。",
    condition: "SS撃沈 / FIREのみ / 1行動 / 自軍先制",
    fleet: ["submarine"],
    enemyFleet: ["submarine"],
    playerFleet: ["escort"],
    enemyFirst: false,
    allowedWeapons: ["fire"],
    objective: { kind: "destroy-targets", targets: ["submarine"], maxFriendlyActions: 1 },
    playerPlacements: [{ id: "escort", start: { x: 0, y: 7 }, orientation: "east" }],
    enemyPlacements: [{ id: "submarine", start: { x: 3, y: 4 }, orientation: "east" }],
    initialIntel: [
      { coord: { x: 3, y: 3 }, mark: "echo" },
      { coord: { x: 2, y: 4 }, mark: "echo" },
      { coord: { x: 3, y: 5 }, mark: "echo" },
    ],
    enemyDisclosure: {
      known: [],
      unknownCount: 1,
      summary: "D-4・E-3・F-4の3区画でECHOを記録。敵艦種と直接位置は未識別。",
    },
    fixedSeed: 0x4d0505,
    aiSkill: 1.1,
    huntBreadth: 4,
    completion: {
      success: "CONTACT RESOLVED：三つの反響交点で敵潜水艦の戦闘能力喪失を確認。",
      deadline: "FIRING SOLUTION LOST：初動射撃を外し、敵潜水艦は接触範囲外へ離脱。",
    },
  },
  {
    id: 6,
    sortOrder: 30,
    difficulty: 2,
    category: "standard",
    title: "RANGING FAN",
    subtitle: "既知弾着から散布界の正方位を導け",
    directive: "CAの艦姿勢を限定し、8-INCH STRADDLE 1射で残存区画を破壊せよ。",
    condition: "CA撃沈 / STRADDLEのみ / 1行動 / 自軍先制",
    fleet: ["cruiser"],
    enemyFleet: ["cruiser"],
    playerFleet: ["cruiser"],
    enemyFirst: false,
    allowedWeapons: ["sparrow"],
    objective: { kind: "destroy-targets", targets: ["cruiser"], maxFriendlyActions: 1 },
    playerPlacements: [{ id: "cruiser", start: { x: 0, y: 7 }, orientation: "east" }],
    enemyPlacements: [{ id: "cruiser", start: { x: 1, y: 4 }, orientation: "east" }],
    enemyInitialHits: [{ x: 3, y: 4 }, { x: 4, y: 4 }],
    initialIntel: [{ coord: { x: 5, y: 4 }, mark: "echo" }],
    initiallyIdentified: ["cruiser"],
    enemyDisclosure: {
      known: ["cruiser"],
      unknownCount: 0,
      summary: "CA重要区画E-4とE-5の命中、E-6の既知空所を公開。",
    },
    fixedSeed: 0x4d0606,
    aiSkill: 1.2,
    huntBreadth: 4,
    completion: {
      success: "RANGING COMPLETE：正方位の夾叉射撃により敵巡洋艦の戦闘能力喪失を確認。",
      deadline: "RANGING ERROR：散布界が残存区画を捉えず、敵艦の離脱を許す。",
    },
  },
  {
    id: 7,
    sortOrder: 50,
    difficulty: 3,
    category: "standard",
    title: "CROSSING SHOT",
    subtitle: "一つの交差弾道で二つの残存区画を捕捉せよ",
    directive: "HARPOONのX字弾道を重ね、1回の射撃で敵DD・DEを同時に撃沈せよ。",
    condition: "DD・DE撃沈 / HARPOONのみ / 1行動 / 自軍先制",
    fleet: ["destroyer", "escort"],
    enemyFleet: ["destroyer", "escort"],
    playerFleet: ["battleship"],
    enemyFirst: false,
    allowedWeapons: ["harpoon"],
    objective: { kind: "destroy-targets", targets: ["destroyer", "escort"], maxFriendlyActions: 1 },
    playerPlacements: [{ id: "battleship", start: { x: 0, y: 7 }, orientation: "east" }],
    enemyPlacements: [
      { id: "destroyer", start: { x: 0, y: 2 }, orientation: "east" },
      { id: "escort", start: { x: 4, y: 4 }, orientation: "east" },
    ],
    enemyInitialHits: [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 5, y: 4 }],
    initialIntel: [
      { coord: { x: 6, y: 4 }, mark: "echo" },
      { coord: { x: 5, y: 3 }, mark: "echo" },
      { coord: { x: 5, y: 5 }, mark: "echo" },
    ],
    initiallyIdentified: ["destroyer", "escort"],
    enemyDisclosure: {
      known: ["destroyer", "escort"],
      unknownCount: 0,
      summary: "DD残存C-3、DE残存E-5を既存命中と既知空所から限定。",
    },
    fixedSeed: 0x4d0707,
    aiSkill: 1.35,
    huntBreadth: 3,
    completion: {
      success: "CROSSING SOLUTION：単一射撃で通過対象2隻の戦闘能力喪失を確認。",
      deadline: "SALVO DISPERSED：交差点を外し、対象艦の同時無力化に失敗。",
    },
  },
  {
    id: 8,
    sortOrder: 60,
    difficulty: 3,
    category: "standard",
    title: "DIVIDED BATTERY",
    subtitle: "残存区画に合わせ、二種の砲撃を配分せよ",
    directive: "STRADDLEとMK-45 IIを適切な対象へ割り当て、2行動で敵CA・DDを撃沈せよ。",
    condition: "CA・DD撃沈 / 2行動 / 自軍CA・DD生存 / 自軍先制",
    fleet: ["cruiser", "destroyer"],
    enemyFleet: ["cruiser", "destroyer"],
    playerFleet: ["cruiser", "destroyer"],
    enemyFirst: false,
    allowedWeapons: ["sparrow", "mk45"],
    objective: {
      kind: "destroy-targets",
      targets: ["cruiser", "destroyer"],
      maxFriendlyActions: 2,
      protectedShips: ["cruiser", "destroyer"],
    },
    playerPlacements: [
      { id: "cruiser", start: { x: 0, y: 7 }, orientation: "east" },
      { id: "destroyer", start: { x: 5, y: 5 }, orientation: "east" },
    ],
    enemyPlacements: [
      { id: "cruiser", start: { x: 1, y: 1 }, orientation: "east" },
      { id: "destroyer", start: { x: 4, y: 6 }, orientation: "east" },
    ],
    enemyInitialHits: [{ x: 4, y: 1 }, { x: 5, y: 6 }],
    initialIntel: [
      { coord: { x: 5, y: 1 }, mark: "echo" },
      { coord: { x: 5, y: 5 }, mark: "echo" },
      { coord: { x: 5, y: 7 }, mark: "echo" },
    ],
    initiallyIdentified: ["cruiser", "destroyer"],
    enemyDisclosure: {
      known: ["cruiser", "destroyer"],
      unknownCount: 0,
      summary: "CA残存3区画とDD残存2区画を射撃諸元と既知空所から公開。",
    },
    fixedSeed: 0x4d0808,
    aiSkill: 1.55,
    huntBreadth: 3,
    completion: {
      success: "BATTERY ASSIGNMENT COMPLETE：両砲系の配分を適正化し、指定2隻を無力化。",
      deadline: "FIRE PLAN EXHAUSTED：兵装配分が適合せず、一方の敵艦が残存。",
      protected: {
        cruiser: "RANGING BATTERY LOST：巡洋艦の戦闘能力喪失。夾叉射撃実施不能。",
        destroyer: "PRECISION BATTERY LOST：駆逐艦の戦闘能力喪失。連続射撃実施不能。",
      },
    },
  },
  {
    id: 9,
    sortOrder: 70,
    difficulty: 3,
    category: "standard",
    title: "COMMAND SECTION",
    subtitle: "残存艦の一弾で敵指揮区画を特定せよ",
    directive: "事前解析が示すD-4を攻撃し、敵艦種を識別せよ。撃沈は不要。",
    condition: "CA識別 / FIREのみ / 1行動 / 自軍DD生存 / 敵先制",
    fleet: ["cruiser"],
    enemyFleet: ["cruiser"],
    playerFleet: ["destroyer"],
    enemyFirst: true,
    allowedWeapons: ["fire"],
    objective: {
      kind: "identify-targets",
      targets: ["cruiser"],
      maxFriendlyActions: 1,
      protectedShips: ["destroyer"],
    },
    playerPlacements: [{ id: "destroyer", start: { x: 1, y: 7 }, orientation: "east" }],
    enemyPlacements: [{ id: "cruiser", start: { x: 1, y: 3 }, orientation: "east" }],
    playerInitialHits: [{ x: 1, y: 7 }, { x: 3, y: 7 }],
    enemyDisclosure: {
      known: [],
      unknownCount: 1,
      candidateCells: [{ code: "ESTIMATED CIC / D-4", coord: { x: 3, y: 3 } }],
      summary: "4区画級水上艦の水平航路と指揮反応D-4のみ公開。艦種は未識別。",
    },
    fixedSeed: 0x4d0909,
    aiSkill: 1.64,
    huntBreadth: 2,
    completion: {
      success: "IDENTIFICATION COMPLETE：重要区画命中により敵巡洋艦を識別。資料回収後、離脱する。",
      deadline: "IDENTIFICATION FAILED：指揮区画を捕捉できず、敵影は未識別のまま離脱。",
      protected: { destroyer: "OBSERVATION SHIP LOST：識別任務担当艦の戦闘能力喪失。" },
    },
  },
  {
    id: 10,
    sortOrder: 90,
    difficulty: 4,
    category: "standard",
    title: "SHADOW DIVIDE",
    subtitle: "聴音で二候補を分断し、残る一点を攻撃せよ",
    directive: "ALPHAでNO CONTACTを確認し、残るBRAVOの敵潜水艦を2行動で撃沈せよ。",
    condition: "ALPHA NO CONTACT→SS撃沈 / 2行動 / 自軍SS生存",
    fleet: ["submarine"],
    enemyFleet: ["submarine"],
    playerFleet: ["escort", "submarine"],
    enemyFirst: false,
    allowedWeapons: ["radar", "fire"],
    objective: {
      kind: "scan-and-destroy",
      targets: ["submarine"],
      maxFriendlyActions: 2,
      protectedShips: ["submarine"],
      reports: [{ origin: { x: 1, y: 1 }, contact: false, code: "ALPHA / B-2" }],
    },
    playerPlacements: [
      { id: "escort", start: { x: 0, y: 0 }, orientation: "east" },
      { id: "submarine", start: { x: 7, y: 7 }, orientation: "east" },
    ],
    enemyPlacements: [{ id: "submarine", start: { x: 5, y: 5 }, orientation: "east" }],
    enemyDisclosure: {
      known: [],
      unknownCount: 1,
      candidateCells: [
        { code: "ALPHA / C-3", coord: { x: 2, y: 2 } },
        { code: "BRAVO / F-6", coord: { x: 5, y: 5 } },
      ],
      summary: "単一潜水艦の候補位置はC-3またはF-6。ALPHA聴音区画はB-2起点。",
    },
    fixedSeed: 0x4d0a0a,
    aiSkill: 1.7,
    huntBreadth: 2,
    completion: {
      success: "SHADOW RESOLVED：聴音で候補を分断し、残存接触の戦闘能力喪失を確認。",
      deadline: "TRACK DIVISION FAILED：聴音と攻撃の手順を完了できず、敵潜水艦を喪失。",
      protected: { submarine: "LISTENING UNIT LOST：自軍潜水艦との連絡途絶。聴音追跡を中止。" },
    },
  },
  {
    id: 11,
    sortOrder: 100,
    difficulty: 4,
    category: "standard",
    title: "CUT THE SCREEN",
    subtitle: "敵護衛連接を先に断ち、次発航空攻撃を封じよ",
    directive: "損傷BBを守り、敵DEとCVを3行動で撃沈せよ。",
    condition: "DE→CV撃沈 / 3行動 / 自軍BB生存 / 敵先制",
    fleet: ["carrier", "escort"],
    enemyFleet: ["carrier", "escort"],
    playerFleet: ["battleship"],
    enemyFirst: true,
    allowedWeapons: ["fire", "harpoon"],
    objective: {
      kind: "destroy-targets",
      targets: ["escort", "carrier"],
      maxFriendlyActions: 3,
      protectedShips: ["battleship"],
      requiredDestructionOrder: ["escort", "carrier"],
    },
    playerPlacements: [{ id: "battleship", start: { x: 0, y: 6 }, orientation: "east" }],
    enemyPlacements: [
      { id: "carrier", start: { x: 2, y: 3 }, orientation: "east" },
      { id: "escort", start: { x: 3, y: 2 }, orientation: "east" },
    ],
    playerInitialHits: [{ x: 0, y: 6 }, { x: 4, y: 6 }],
    enemyInitialHits: [
      { x: 3, y: 3 }, { x: 5, y: 3 }, { x: 2, y: 4 }, { x: 4, y: 4 },
      { x: 3, y: 2 },
    ],
    initiallyIdentified: ["carrier", "escort"],
    enemyDisclosure: {
      known: ["carrier", "escort"],
      unknownCount: 0,
      summary: "CV・DEの全射撃諸元、既命中5区画、護衛連接ACTIVEを公開。",
    },
    fixedSeed: 0x4d0b0b,
    aiSkill: 1.78,
    huntBreadth: 2,
    completion: {
      success: "SCREEN COLLAPSED：護衛連接を断った後、敵空母の戦闘能力喪失を確認。",
      deadline: "AIR THREAT RETAINED：敵護衛連接と航空運用能力を所定時間内に無力化できず。",
      protected: { battleship: "CAPITAL UNIT LOST：自軍戦艦の戦闘能力喪失。護衛網突破を中止。" },
    },
  },
  {
    id: 12,
    sortOrder: 120,
    difficulty: 5,
    category: "standard",
    title: "DUAL LINK",
    subtitle: "一隻の護衛艦で二つの火力連接を維持せよ",
    directive: "CV・BB両連接を維持し、PHANTOM 2出撃とHARPOON 3回で5行動以内に指定4隻を撃沈せよ。",
    condition: "BB・CA・DD・DE撃沈 / 5行動 / CV・BB・DE生存 / 両連接ACTIVE",
    fleet: ["battleship", "cruiser", "destroyer", "escort"],
    enemyFleet: ["battleship", "cruiser", "destroyer", "escort"],
    playerFleet: ["carrier", "battleship", "escort"],
    enemyFirst: false,
    allowedWeapons: ["phantom", "harpoon"],
    objective: {
      kind: "destroy-targets",
      targets: ["battleship", "cruiser", "destroyer", "escort"],
      maxFriendlyActions: 5,
      protectedShips: ["carrier", "battleship", "escort"],
    },
    playerPlacements: [
      { id: "carrier", start: { x: 1, y: 3 }, orientation: "east" },
      { id: "battleship", start: { x: 0, y: 6 }, orientation: "east" },
      { id: "escort", start: { x: 2, y: 5 }, orientation: "east" },
    ],
    enemyPlacements: [
      { id: "battleship", start: { x: 0, y: 0 }, orientation: "east" },
      { id: "cruiser", start: { x: 0, y: 3 }, orientation: "east" },
      { id: "destroyer", start: { x: 5, y: 7 }, orientation: "east" },
      { id: "escort", start: { x: 6, y: 5 }, orientation: "east" },
    ],
    enemyInitialHits: [{ x: 7, y: 5 }],
    initiallyIdentified: ["battleship", "cruiser", "destroyer", "escort"],
    enemyDisclosure: {
      known: ["battleship", "cruiser", "destroyer", "escort"],
      unknownCount: 0,
      summary: "指定4隻の全射撃諸元とDE F-8命中を公開。課題は索敵ではなく連接火力の配分。",
    },
    requiredLinks: ["carrier", "battleship"],
    fixedSeed: 0x4d0c0c,
    aiSkill: 1.82,
    huntBreadth: 1,
    completion: {
      success: "DUAL LINK STRIKE COMPLETE：二系統の支援連接を維持し、指定4隻の戦闘能力喪失を確認。",
      deadline: "FIRE PLAN INCOMPLETE：配分された5行動内に指定火力計画を完了できず。",
      protected: {
        carrier: "AIR LINK LOST：空母の戦闘能力喪失。航空打撃計画を中止。",
        battleship: "MISSILE LINK LOST：戦艦の戦闘能力喪失。誘導弾射撃計画を中止。",
        escort: "DUAL CONTROL LOST：護衛艦の戦闘能力喪失。両連接の維持不能。",
      },
    },
  },
];

/**
 * 過去の作戦日誌を読み、現在の戦術状態を復元する独立任務群。
 * 本編12任務とは別カテゴリで、IDと記録も共有しない。
 */
export const ARCHIVE_MISSIONS: ReadonlyArray<MissionStageDefinition> = [
  {
    id: 13,
    sortOrder: 10,
    difficulty: 2,
    category: "archive",
    title: "TRACK RECONSTRUCTION",
    subtitle: "命中順序と空所記録から艦姿勢を復元せよ",
    directive: "日誌からCA-04 ORPHEUSの残存区画を導き、MK-45 II 1回で撃沈せよ。",
    condition: "ORPHEUS撃沈 / MK-45 IIのみ / 1行動 / UNKNOWN 2隻は非目標",
    fleet: ["battleship", "cruiser", "submarine"],
    enemyFleet: ["battleship", "cruiser", "submarine"],
    playerFleet: ["destroyer"],
    enemyFirst: false,
    allowedWeapons: ["mk45"],
    objective: { kind: "destroy-targets", targets: ["cruiser"], maxFriendlyActions: 1 },
    playerPlacements: [{ id: "destroyer", start: { x: 0, y: 6 }, orientation: "east" }],
    enemyPlacements: [
      { id: "battleship", start: { x: 0, y: 0 }, orientation: "east" },
      { id: "cruiser", start: { x: 1, y: 3 }, orientation: "east" },
      { id: "submarine", start: { x: 7, y: 7 }, orientation: "east" },
    ],
    enemyInitialHits: [{ x: 3, y: 3 }, { x: 4, y: 3 }],
    initialIntel: [{ coord: { x: 5, y: 3 }, mark: "echo" }],
    initiallyIdentified: ["cruiser"],
    enemyDisclosure: {
      known: ["cruiser"],
      unknownCount: 2,
      callsigns: { cruiser: "CA-04 ORPHEUS" },
      summary: "ORPHEUSの重要区画D-4、同一艦D-5の命中、D-6の既知空所を日誌から復元。",
    },
    archiveLog: [
      { time: "1840Z", text: "ORDER OF BATTLE：CA-04 “ORPHEUS” CONFIRMED / UNKNOWN CONTACTS 2" },
      { time: "1841Z", text: "D-4 IMPORTANT SECTION HIT：ORPHEUS", tone: "critical" },
      { time: "1842Z", text: "D-5 HIT：SAME HULL" },
      { time: "1844Z", text: "D-6 ECHO：NO HULL SECTION" },
      { time: "1845Z", text: "FIRE CONTROL TRANSFERRED TO BLUE" },
    ],
    fixedSeed: 0x4d0d0d,
    aiSkill: 1.35,
    huntBreadth: 3,
    completion: {
      success: "TRACK RECONSTRUCTED：航跡復元によりORPHEUSの残存区画を捕捉。",
      deadline: "TRACK MISREAD：艦姿勢の復元を誤り、ORPHEUSの離脱を許す。",
    },
  },
  {
    id: 14,
    sortOrder: 20,
    difficulty: 3,
    category: "archive",
    title: "MAGAZINE ACCOUNT",
    subtitle: "支援連接喪失後の実残弾数を算定せよ",
    directive: "日誌からHARPOON残弾を算定し、残る1回でCV-08 ARGUSを撃沈せよ。",
    condition: "ARGUS撃沈 / HARPOON実残1 / BB生存 / 自軍先制",
    fleet: ["carrier", "submarine"],
    enemyFleet: ["carrier", "submarine"],
    playerFleet: ["battleship"],
    enemyFirst: false,
    allowedWeapons: ["harpoon"],
    objective: {
      kind: "destroy-targets",
      targets: ["carrier"],
      maxFriendlyActions: 1,
      protectedShips: ["battleship"],
    },
    playerPlacements: [{ id: "battleship", start: { x: 0, y: 6 }, orientation: "east" }],
    enemyPlacements: [
      { id: "carrier", start: { x: 2, y: 2 }, orientation: "east" },
      { id: "submarine", start: { x: 7, y: 7 }, orientation: "east" },
    ],
    enemyInitialHits: [
      { x: 2, y: 2 }, { x: 4, y: 2 },
      { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
    ],
    initiallyIdentified: ["carrier"],
    initialArsenal: { harpoon: 2 },
    enemyDisclosure: {
      known: ["carrier"],
      unknownCount: 1,
      callsigns: { carrier: "CV-08 ARGUS" },
      summary: "ARGUSはC-4・C-6のみ未破壊。UNKNOWN 1隻は非目標。",
    },
    archiveLog: [
      { time: "2011Z", text: "DE-01：FIRE CONTROL LINK ACTIVE / HARPOON AUTHORIZATION 3" },
      { time: "2013Z", text: "HARPOON SALVO 1：EXPENDED" },
      { time: "2015Z", text: "DE-01：COMBAT CAPABILITY LOST", tone: "critical" },
      { time: "2016Z", text: "FIRE CONTROL LINK LOST：LOCAL AUTHORIZATION 2", tone: "warning" },
      { time: "2018Z", text: "CV-08 “ARGUS”：C-4 / C-6 UNBROKEN, OTHER SECTIONS HIT" },
    ],
    fixedSeed: 0x4d0e0e,
    aiSkill: 1.55,
    huntBreadth: 2,
    completion: {
      success: "MAGAZINE SOLUTION COMPLETE：最終許可弾を2区画へ同時指向し、ARGUSを無力化。",
      deadline: "MAGAZINE EMPTY：実残弾の算定を誤り、ARGUSの戦闘能力が残存。",
      protected: { battleship: "LAUNCH PLATFORM LOST：誘導弾発射艦の戦闘能力喪失。" },
    },
  },
  {
    id: 15,
    sortOrder: 30,
    difficulty: 4,
    category: "archive",
    title: "RELIEF OF WATCH",
    subtitle: "当直交代記録から次の射撃権と最優先脅威を読め",
    directive: "射撃指揮移管後の最初の1行動でDD-03を撃沈し、損傷空母を保全せよ。",
    condition: "DD撃沈 / FIREのみ / 1行動 / CV生存 / 日誌上は自軍手番",
    fleet: ["destroyer", "submarine"],
    enemyFleet: ["destroyer", "submarine"],
    playerFleet: ["carrier"],
    enemyFirst: false,
    allowedWeapons: ["fire"],
    objective: {
      kind: "destroy-targets",
      targets: ["destroyer"],
      maxFriendlyActions: 1,
      protectedShips: ["carrier"],
    },
    playerPlacements: [{ id: "carrier", start: { x: 0, y: 0 }, orientation: "east" }],
    enemyPlacements: [
      { id: "destroyer", start: { x: 5, y: 6 }, orientation: "east" },
      { id: "submarine", start: { x: 0, y: 7 }, orientation: "east" },
    ],
    playerInitialHits: [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
    ],
    enemyInitialHits: [{ x: 5, y: 6 }, { x: 6, y: 6 }],
    initiallyIdentified: ["destroyer"],
    enemyDisclosure: {
      known: ["destroyer"],
      unknownCount: 1,
      callsigns: { destroyer: "DD-03" },
      summary: "DD-03はG-8のみ未破壊。UNKNOWN 1隻は非目標。",
    },
    archiveLog: [
      { time: "0310Z", text: "HOSTILE FIRE COMPLETE" },
      { time: "0311Z", text: "OWN CV：DAMAGE 7/8 / FLIGHT CONTROL REMAINS", tone: "critical" },
      { time: "0312Z", text: "WATCH RELIEF COMPLETE：FIRE CONTROL PASSED TO BLUE" },
      { time: "0313Z", text: "HOSTILE DD-03：G-6 / G-7 HIT, G-8 UNBROKEN" },
      { time: "0314Z", text: "DD-03 FIRE SOLUTION RETAINED ON OWN CV", tone: "warning" },
    ],
    fixedSeed: 0x4d0f0f,
    aiSkill: 1.72,
    huntBreadth: 1,
    completion: {
      success: "WATCH RELIEF COMPLETE：射撃指揮移管直後にDD-03を無力化。損傷空母の保全を確認。",
      deadline: "HOSTILE WINDOW OPEN：最優先脅威の処理が間に合わず、敵射撃窓へ移行。",
      protected: { carrier: "FLIGHT CONTROL LOST：損傷空母の戦闘能力喪失。" },
    },
  },
  {
    id: 16,
    sortOrder: 40,
    difficulty: 4,
    category: "archive",
    title: "NAMED HULL",
    subtitle: "目視艦名と両端弾着から指定艦の残存範囲を読め",
    directive: "五区画艦VIGILANTの残存3区画に夾叉射撃を重ね、1行動で撃沈せよ。",
    condition: "VIGILANT撃沈 / STRADDLEのみ / 1行動 / UNKNOWNは非目標",
    fleet: ["battleship", "cruiser"],
    enemyFleet: ["battleship", "cruiser"],
    playerFleet: ["cruiser"],
    enemyFirst: false,
    allowedWeapons: ["sparrow"],
    objective: { kind: "destroy-targets", targets: ["battleship"], maxFriendlyActions: 1 },
    playerPlacements: [{ id: "cruiser", start: { x: 0, y: 7 }, orientation: "east" }],
    enemyPlacements: [
      { id: "battleship", start: { x: 5, y: 1 }, orientation: "south" },
      { id: "cruiser", start: { x: 0, y: 0 }, orientation: "east" },
    ],
    enemyInitialHits: [{ x: 5, y: 1 }, { x: 5, y: 5 }],
    initiallyIdentified: ["battleship"],
    enemyDisclosure: {
      known: ["battleship"],
      unknownCount: 1,
      callsigns: { battleship: "BB-05 VIGILANT" },
      summary: "VIGILANTはB-6からF-6へ南進。両端B-6/F-6は命中済み。",
    },
    archiveLog: [
      { time: "2210Z", text: "VISUAL ID：“VIGILANT” / FIVE-SECTION HULL / COURSE SOUTH" },
      { time: "2212Z", text: "B-6 HIT：VIGILANT BOW SECTION" },
      { time: "2213Z", text: "F-6 HIT：VIGILANT STERN SECTION" },
      { time: "2215Z", text: "A-2 CONTACT：IDENTITY UNKNOWN / NON-OBJECTIVE" },
      { time: "2216Z", text: "8-INCH BATTERY：ONE RANGING SALVO READY" },
    ],
    fixedSeed: 0x4d1010,
    aiSkill: 1.75,
    huntBreadth: 1,
    completion: {
      success: "NAMED TARGET NEUTRALIZED：艦名・航路・両端損傷を照合し、VIGILANTを無力化。",
      deadline: "TARGET CORRELATION FAILED：艦名と弾着記録の照合を誤り、指定艦が残存。",
    },
  },
];

export const MISSION_LIBRARY: ReadonlyArray<MissionStageDefinition> = [
  ...[...MISSION_STAGES].sort((a, b) => a.sortOrder - b.sortOrder),
  ...[...ARCHIVE_MISSIONS].sort((a, b) => a.sortOrder - b.sortOrder),
  ...[...EXTREME_MISSIONS].sort((a, b) => a.sortOrder - b.sortOrder),
];

export function missionLibraryFor(category: MissionCategory) {
  if (category === "training") return TRAINING_STAGES;
  return MISSION_LIBRARY.filter((mission) => mission.category === category);
}

export function usesTacticsRules(mode: GameMode) {
  return mode === "tactics" || mode === "survival" || mode === "mission" || mode === "training";
}

export function aiSkillFor(mode: GameMode, stageId: number, base: number) {
  if (mode === "mission" || mode === "training") return base;
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
  if (mode === "mission") return MISSION_LIBRARY;
  if (mode === "training") return TRAINING_STAGES;
  return STAGES;
}

export function missionRuleFor(mode: GameMode, stage: StageDefinition) {
  if (mode === "mission") return MISSION_LIBRARY.find((candidate) => candidate.id === stage.id) ?? null;
  if (mode === "training") return TRAINING_STAGES.find((candidate) => candidate.id === stage.id) ?? null;
  return null;
}

export function isSeaBatStage(mode: GameMode, stage: StageDefinition) {
  return mode === "survival" && stage.id === 5;
}

export function isSilentStage(mode: GameMode, stage: StageDefinition) {
  if (isSeaBatStage(mode, stage)) return true;
  const scenario = missionRuleFor(mode, stage);
  return scenario?.enemyFleet.some((id) => id === "silentSubmarine" || id === "leviathan") ?? false;
}

export function huntBreadthFor(mode: GameMode, operationIndex: number) {
  if (mode === "survival") return [8, 5, 1, 3][operationIndex] ?? 1;
  if (mode === "mission") return MISSION_LIBRARY[operationIndex]?.huntBreadth ?? 1;
  if (mode === "training") return TRAINING_STAGES[operationIndex]?.huntBreadth ?? 1;
  return 1;
}

export function playerFleetFor(mode: GameMode, stage: StageDefinition, survivalFleet: ShipId[]) {
  if (mode === "survival") return [...survivalFleet];
  return [...(missionRuleFor(mode, stage)?.playerFleet ?? stage.fleet)];
}

export function friendlyStarts(mode: GameMode, stage: StageDefinition) {
  if (mode === "mission" || mode === "training") return !missionRuleFor(mode, stage)?.enemyFirst;
  return mode === "casual";
}

export function routeUnit(mode: GameMode) {
  if (mode === "survival") return { english: "OPERATION", japanese: "作戦" };
  if (mode === "mission") return { english: "MISSION", japanese: "限定任務" };
  if (mode === "training") return { english: "LESSON", japanese: "訓練" };
  return { english: "SECTOR", japanese: "海域" };
}

export function survivingFleet(currentFleet: ShipId[], sunk: ShipId[]) {
  const lost = new Set(sunk);
  return currentFleet.filter((id) => !lost.has(id));
}
