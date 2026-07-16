export const GAME_TITLE = "DEEP BLUE GRID";
export const GRID_SIZE = 8;
export const CELL_LABELS = "ABCDEFGH";

export type ShipId = "battleship" | "destroyer" | "submarine";
export type WeaponId = "fire" | "harpoon" | "mk45" | "radar";
export type Orientation = "horizontal" | "vertical";
export type Coord = { x: number; y: number };

export const SHIPS: ReadonlyArray<{ id: ShipId; name: string; code: string; size: number; weapon: string }> = [
  { id: "battleship", name: "戦艦", code: "BB-05", size: 5, weapon: "HARPOON" },
  { id: "destroyer", name: "駆逐艦", code: "DD-03", size: 3, weapon: "MK-45 II" },
  { id: "submarine", name: "潜水艦", code: "SS-01", size: 1, weapon: "SPS-10" },
];

export const HARPOON_PATTERN: ReadonlyArray<Coord> = [
  { x: -1, y: -1 }, { x: 1, y: -1 }, { x: 0, y: 0 }, { x: -1, y: 1 }, { x: 1, y: 1 },
];

export const WEAPON_MAX = { harpoon: 1, mk45: 1, radar: 3 } as const;
