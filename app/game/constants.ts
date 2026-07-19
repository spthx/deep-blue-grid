export const GAME_TITLE = "DEEP BLUE GRID";
export const GRID_SIZE = 8;
export const CELL_LABELS = "ABCDEFGH";

export type ShipId = "carrier" | "battleship" | "cruiser" | "destroyer" | "escort" | "submarine";
export type WeaponId = "fire" | "phantom" | "harpoon" | "sparrow" | "mk45" | "radar";
export const ORIENTATIONS = ["east", "south", "west", "north"] as const;
export type Orientation = typeof ORIENTATIONS[number];
export type Coord = { x: number; y: number };

export const isHorizontal = (orientation: Orientation) => orientation === "east" || orientation === "west";

export const SHIPS: ReadonlyArray<{ id: ShipId; name: string; code: string; size: number; width: number; height: number; weapon: string; critical: Coord }> = [
  { id: "carrier", name: "空母", code: "CV-08", size: 8, width: 4, height: 2, weapon: "F-4 PHANTOM", critical: { x: 2, y: 0 } },
  { id: "battleship", name: "戦艦", code: "BB-05", size: 5, width: 5, height: 1, weapon: "HARPOON", critical: { x: 2, y: 0 } },
  { id: "cruiser", name: "巡洋艦", code: "CA-04", size: 4, width: 4, height: 1, weapon: "SEA SPARROW", critical: { x: 2, y: 0 } },
  { id: "destroyer", name: "駆逐艦", code: "DD-03", size: 3, width: 3, height: 1, weapon: "MK-45 II", critical: { x: 1, y: 0 } },
  { id: "escort", name: "護衛艦", code: "DE-02", size: 2, width: 2, height: 1, weapon: "NONE", critical: { x: 1, y: 0 } },
  { id: "submarine", name: "潜水艦", code: "SS-01", size: 1, width: 1, height: 1, weapon: "SPS-10", critical: { x: 0, y: 0 } },
];

export type StageDefinition = {
  id: number;
  title: string;
  subtitle: string;
  fleet: ShipId[];
  aiSkill: number;
};

export const STAGES: ReadonlyArray<StageDefinition> = [
  { id: 1, title: "FIRST CONTACT", subtitle: "初期艦隊で索敵の基本を掴め", fleet: ["battleship", "destroyer", "submarine"], aiSkill: .82 },
  { id: 2, title: "ESCORT LINE", subtitle: "護衛艦を加えた近海防衛線", fleet: ["battleship", "destroyer", "escort", "submarine"], aiSkill: .92 },
  { id: 3, title: "CRUISER GAP", subtitle: "巡洋艦と範囲兵装が戦線を拡大", fleet: ["battleship", "cruiser", "destroyer", "escort", "submarine"], aiSkill: 1 },
  { id: 4, title: "CROSS FIRE", subtitle: "複数兵装を温存し敵中枢を狙え", fleet: ["battleship", "cruiser", "destroyer", "escort", "submarine"], aiSkill: 1.05 },
  { id: 5, title: "CARRIER SCREEN", subtitle: "全6艦種による総力海戦", fleet: ["carrier", "battleship", "cruiser", "destroyer", "escort", "submarine"], aiSkill: 1.1 },
  { id: 6, title: "DEEP BLUE GRID", subtitle: "最終海域。全艦隊を撃沈せよ", fleet: ["carrier", "battleship", "cruiser", "destroyer", "escort", "submarine"], aiSkill: 1.16 },
];

export const HARPOON_PATTERN: ReadonlyArray<Coord> = [
  { x: -1, y: -1 }, { x: 1, y: -1 }, { x: 0, y: 0 }, { x: -1, y: 1 }, { x: 1, y: 1 },
];

// ECHO(索敵反応)の判定方向。
// "orthogonal" = 原作準拠、着弾点の上下左右4方向のみを見る。
// "octant"     = 周囲8方向(斜め含む)を見る従来仕様。
// 切り替えたい場合はこの1行の値を変えるだけでよい(セーブデータ等への影響なし)。
export const ECHO_MODE: "orthogonal" | "octant" = "orthogonal";

const ECHO_DIRECTIONS_BY_MODE: Record<"orthogonal" | "octant", ReadonlyArray<Coord>> = {
  orthogonal: [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
  ],
  octant: [
    { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
    { x: -1, y: 0 }, { x: 1, y: 0 },
    { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
  ],
};

export const ECHO_DIRECTIONS: ReadonlyArray<Coord> = ECHO_DIRECTIONS_BY_MODE[ECHO_MODE];

export const WEAPON_MAX = { phantom: 2, harpoon: 2, sparrow: 1, mk45: 1, radar: 2 } as const;
